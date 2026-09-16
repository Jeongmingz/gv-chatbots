import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import {
  findBestFaq,
  getContextualRelatedFaqs,
  jsonWithFlatFaqs,
  normalizeQueryText,
  searchFaq
} from "../src/faq.js";
import { getBrandConfig } from "../src/brands.js";
import { createFaqHistoryEntry, formatKoreaTimestamp } from "../src/history.js";
import { findTypoCorrection, normalizeQueryTypos } from "../src/typo-normalizer.js";
import { getBrandSession } from "../src/brand-session.js";
import {
  basicCard,
  basicCardCarousel,
  blockButton,
  carouselHeader,
  extractUtterance,
  imageCardCarousel,
  itemCard,
  operatorButton,
  phoneButton,
  shareButton,
  textCard
} from "../src/kakao.js";
import { buildSkillFaqResponse } from "../src/skill-response.js";
import { normalizeFaqPresentation } from "../src/faq-presentation.js";
import { route as serverRoute } from "../src/server.js";
import { route as workerRoute } from "../src/worker.js";
import {
  inferTargetType,
  buildTrackedUrl,
  createClickHistoryEntry,
  createActionHistoryEntry
} from "../src/analytics.js";

const data = jsonWithFlatFaqs(
  JSON.parse(fs.readFileSync(new URL("../data/laurastar-faq.json", import.meta.url), "utf8"))
);
const woodsBrand = getBrandConfig("woods");
const woodsData = woodsBrand.data;
const aarkeBrand = getBrandConfig("aarke");
const aarkeData = aarkeBrand.data;
const litterRobotBrand = getBrandConfig("litter-robot");
const litterRobotData = litterRobotBrand.data;
const imetecBrand = getBrandConfig("imetec");
const imetecData = imetecBrand.data;

function outputText(response) {
  return response.template.outputs
    .map((output) => output.simpleText?.text || output.basicCard?.description || "")
    .join("\n");
}

function outputButtons(response) {
  return response.template.outputs.flatMap((output) => output.basicCard?.buttons || []);
}

function outputImages(response) {
  return response.template.outputs.flatMap((output) => output.simpleImage?.imageUrl || []);
}

test("loads categorized FAQ data", () => {
  assert.equal(data.categories.length, 10);
  assert.equal(data.flatFaqs.length, 56);
});

test("formats FAQ history timestamps in Korea local time", () => {
  assert.equal(formatKoreaTimestamp(new Date("2026-05-22T00:15:30.123Z")), "2026-05-22T09:15:30.123");
});

test("normalizes confirmed Korean typo aliases before FAQ matching", () => {
  const result = normalizeQueryTypos("구입했는데 장품등록을 어떻게 하나오");

  assert.equal(result.normalized, "구입했는데 제품등록을 어떻게 하나요");
  assert.equal(result.changed, true);
  assert.deepEqual(
    result.corrections.map((correction) => [correction.original, correction.corrected]),
    [["장품등록", "제품등록"], ["하나오", "하나요"]]
  );
  assert.equal(normalizeQueryText("가스리필 신청합니다"), "가스 리필 신청합니다");
});

test("uses conservative Hangul fuzzy correction only for controlled terms", () => {
  assert.equal(findTypoCorrection("제픔등록")?.corrected, "제품등록");
  assert.equal(findTypoCorrection("실린덜")?.corrected, "실린더");
  assert.equal(findTypoCorrection("교환"), null);
  assert.equal(findTypoCorrection("문의"), null);
});

test("matches production product-registration typos after normalization", () => {
  const match = findBestFaq(aarkeData, "구입했는데 장품등록을 어떻게 하나오");

  assert.equal(match?.faq.id, "aarke-product-registration");
});

test("records typo corrections in FAQ history metadata", () => {
  const query = "구입했는데 장품등록을 어떻게 하나오";
  const match = findBestFaq(aarkeData, query);
  const entry = createFaqHistoryEntry({
    brand: aarkeBrand,
    method: "POST",
    path: "/skill/aarke/faq",
    source: "test",
    query,
    payload: {},
    match
  });

  assert.equal(entry.query, query);
  assert.equal(entry.metadata.queryCorrected, "구입했는데 제품등록을 어떻게 하나요");
  assert.deepEqual(
    entry.metadata.typoCorrections.map((correction) => correction.corrected),
    ["제품등록", "하나요"]
  );
});

test("deletes expired Supabase brand sessions when they are read", async () => {
  const requests = [];
  const brand = await getBrandSession("expired-user", {
    url: "https://example.supabase.co",
    serviceRoleKey: "service-role-key",
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      if (options.method === "GET") {
        return new Response(JSON.stringify([
          { brand: "litter-robot", expires_at: "2020-01-01T00:00:00.000" }
        ]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(null, { status: 204 });
    }
  });

  assert.equal(brand, null);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "DELETE"]);
});

test("matches greeting as a base FAQ response", () => {
  const match = findBestFaq(data, "안녕하세요");
  assert.ok(match);
  assert.equal(match.faq.id, "base-greeting");
  assert.equal(match.faq.categoryId, "base");

  const response = buildSkillFaqResponse(data, "안녕하세요", match, "https://example.com");
  assert.match(outputText(response), /로라스타\(Laurastar\) 고객센터입니다/);
  assert.deepEqual(
    response.template.quickReplies.map((reply) => reply.label),
    ["AS 접수", "사용 설명서", "정품등록", "상담원 연결"]
  );
});

test("provides brand-tailored greeting responses across all 5 brands", () => {
  const brandCases = [
    { brand: data, name: "로라스타", keyword: "스팀의류관리기 로라스타", quickReplies: ["AS 접수", "사용 설명서", "정품등록", "상담원 연결"] },
    { brand: woodsData, name: "우즈", keyword: "제습기 우즈", quickReplies: ["AS 접수", "필터 구매", "사용 설명서", "상담원 연결"] },
    { brand: aarkeData, name: "아르케", keyword: "탄산수 제조기 아르케", quickReplies: ["실린더 구매", "병 세척 안내", "사용 가이드", "상담원 연결"] },
    { brand: litterRobotData, name: "리터로봇", keyword: "고양이 화장실 리터로봇", quickReplies: ["모래 종류", "와이파이 연결", "라이트바 오류", "상담원 연결"] },
    { brand: imetecData, name: "이메텍", keyword: "전기요 이메텍", quickReplies: ["세탁 방법", "조절기 구매", "AS 접수", "상담원 연결"] }
  ];

  for (const { brand, name, keyword, quickReplies } of brandCases) {
    const match = findBestFaq(brand, "안녕하세요");
    assert.ok(match, `${name} should match greeting`);
    assert.equal(match.faq.id, "base-greeting");
    assert.match(match.faq.answer, new RegExp(keyword));

    const response = buildSkillFaqResponse(brand, "안녕하세요", match, "https://example.com", {
      responseLayout: "v2"
    });
    const card = response.template.outputs[0].basicCard;
    assert.ok(card, `${name} should render basicCard in v2`);
    assert.match(card.title, new RegExp(name));
    assert.match(card.description, new RegExp(keyword));
    assert.deepEqual(
      response.template.quickReplies.map((reply) => reply.label),
      quickReplies
    );
  }
});

test("provides dedicated Gatevision greeting response on the unified Kakao skill route", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "안녕하세요"
      }
    })
  });

  const response = await workerRoute(request);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, "2.0");
  const card = body.template.outputs[0].basicCard;
  assert.equal(card.title, "게이트비젼 고객센터");
  assert.match(card.description, /프리미엄 해외 라이프스타일 가전 공식 수입원/);
  assert.equal(card.thumbnail.imageUrl, "https://example.com/assets/Gatevision_Chatbot_Intro.png");
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["로라스타", "우즈", "아르케", "리터로봇", "이메텍", "상담원 연결"]
  );
  assert.equal(body.template.quickReplies[0].messageText, "[브랜드:laurastar]");
  assert.equal(body.template.quickReplies[1].messageText, "[브랜드:woods]");
  assert.equal(body.template.quickReplies[2].messageText, "[브랜드:aarke]");
  assert.equal(body.template.quickReplies[3].messageText, "[브랜드:litter-robot]");
  assert.equal(body.template.quickReplies[4].messageText, "[브랜드:imetec]");
  assert.equal(body.template.quickReplies[5].messageText, "상담원 연결");
});

test("records greeting history as matched", () => {
  const match = findBestFaq(woodsData, "ㅎㅇ");
  const entry = createFaqHistoryEntry({
    brand: woodsBrand,
    method: "POST",
    path: "/skill/faq",
    source: "test",
    query: "ㅎㅇ",
    payload: {},
    match
  });

  assert.equal(entry.matched, true);
  assert.equal(entry.faqId, "base-greeting");
  assert.equal(entry.categoryName, "기본 응답");
  assert.equal(entry.score, 200);
});

test("matches Smart model difference questions", () => {
  const match = findBestFaq(data, "스마트 u m i 차이 알려줘");
  assert.ok(match);
  assert.equal(match.faq.id, "smart-model-differences");
});

test("matches IGGI cap stuck questions", () => {
  const match = findBestFaq(data, "이기 마개가 안 열려요");
  assert.ok(match);
  assert.equal(match.faq.id, "iggi-cap-stuck");
});

test("extracts utterance from Kakao action detail params first", () => {
  const utterance = extractUtterance({
    userRequest: {
      utterance: "발화 내용"
    },
    action: {
      params: {
        utterance: "마개가"
      },
      detailParams: {
        utterance: {
          origin: "마개가",
          value: "마개가"
        }
      }
    }
  });

  assert.equal(utterance, "마개가");
});

test("adds required thumbnails to Kakao basic cards", () => {
  const card = basicCard({
    title: "로라스타 공식 안내",
    description: "공식 페이지에서 자세한 내용을 확인하실 수 있습니다."
  });
  const carousel = basicCardCarousel([
    {
      title: "로라스타 공식 안내",
      description: "공식 페이지에서 자세한 내용을 확인하실 수 있습니다."
    }
  ]);

  assert.ok(card.basicCard.thumbnail.imageUrl);
  assert.ok(carousel.carousel.items[0].thumbnail.imageUrl);
});

test("uses request origin for Laurastar basic card thumbnail", () => {
  const response = buildSkillFaqResponse(
    data,
    "사용 설명서",
    findBestFaq(data, "사용 설명서"),
    "https://example.com"
  );
  const imageUrl = response.template.outputs
    .flatMap((output) => output.basicCard ? [output.basicCard.thumbnail.imageUrl] : [])
    .at(0);

  assert.equal(imageUrl, "https://example.com/assets/laurastar-chatbot-intro.png");
});

test("returns ranked search results", () => {
  const results = searchFaq(data, "리프트 필터 교체 주기", { limit: 3 });
  assert.ok(results.length > 0);
  assert.equal(results[0].faq.id, "izzi-lift-filter-replacement");
});

test("accepts POST search requests on the server route", async () => {
  const req = new EventEmitter();
  req.method = "POST";
  req.url = "https://example.com/faq/search";
  req.headers = {
    host: "example.com",
    "content-type": "application/json"
  };

  let statusCode = null;
  let rawBody = "";
  const res = {
    writeHead(status, headers) {
      statusCode = status;
      this.headers = headers;
    },
    end(body) {
      rawBody = body;
    }
  };

  const routePromise = serverRoute(req, res);
  req.emit("data", Buffer.from(JSON.stringify({ query: "리프트 필터 교체 주기" })));
  req.emit("end");
  await routePromise;

  const body = JSON.parse(rawBody);
  assert.equal(statusCode, 200);
  assert.equal(body.query, "리프트 필터 교체 주기");
  assert.ok(body.results.length > 0);
  assert.equal(body.results[0].id, "izzi-lift-filter-replacement");
});

test("returns Kakao skill response for POST skill search payloads", async () => {
  const req = new EventEmitter();
  req.method = "POST";
  req.url = "https://example.com/faq/search";
  req.headers = {
    host: "example.com",
    "content-type": "application/json"
  };

  let statusCode = null;
  let rawBody = "";
  const res = {
    writeHead(status, headers) {
      statusCode = status;
      this.headers = headers;
    },
    end(body) {
      rawBody = body;
    }
  };

  const routePromise = serverRoute(req, res);
  req.emit(
    "data",
    Buffer.from(
      JSON.stringify({
        userRequest: {
          utterance: "어떤 물을 사용해야 하나요?"
        }
      })
    )
  );
  req.emit("end");
  await routePromise;

  const body = JSON.parse(rawBody);
  assert.equal(statusCode, 200);
  assert.equal(body.version, "2.0");
  assert.ok(body.template.outputs[0].simpleText);
  assert.equal(body.template.outputs[0].simpleText.text.startsWith("Smart, GO+"), true);
});

test("matches AS period questions", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  assert.ok(match);
  assert.equal(match.faq.id, "as-pickup-time");
});

test("matches AS keyword variants case-insensitively", () => {
  const cases = [
    "AS 접수 얼마나 걸려",
    "As 접수 얼마나 걸려",
    "as 접수 얼마나 걸려",
    "A/S 접수 얼마나 걸려",
    "a/s 접수 얼마나 걸려",
    "as는 얼마나 걸려",
    "As접수 얼마나 걸려"
  ];

  for (const query of cases) {
    const match = findBestFaq(data, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, "as-pickup-time", query);
  }
});

test("matches short natural product symptom questions conservatively", () => {
  const cases = [
    ["물이 안 들어가요", "smart-water-not-moving"],
    ["코드선 안 감겨요", "izzi-lift-cord-lock"],
    ["다리미판 흔들려요", "board-balance-check"],
    ["증류수 써도 돼요", "common-water-type"],
    ["잇지 어떤 물 사용", "common-water-type"],
    ["잇지 물 부족 경고등이 떠요", "izzi-lift-water-warning"],
    ["어떤 물을 사용해야 하나요? 아직도 잇지 물 부족 경고등이 떠요리프트 물 부족 경고등이 떠요", "common-water-type"],
    ["스마트 차이", "smart-model-differences"],
    ["고플러스 스마트 차이", "smart-vs-go-plus"]
  ];

  for (const [query, expectedId] of cases) {
    const match = findBestFaq(data, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, expectedId, query);
  }
});

test("builds official Kakao skill response for matched FAQ", () => {
  const match = findBestFaq(data, "IGGI 마개가 안 열려요");
  const response = buildSkillFaqResponse(data, "IGGI 마개가 안 열려요", match);
  const text = outputText(response);

  assert.equal(response.version, "2.0");
  assert.equal(response.template.outputs[0].simpleText.text.startsWith("마개가 열리지 않는 경우"), true);
  assert.equal(text.includes("문의하신 내용은"), false);
  assert.equal(text.includes("검색 확신도"), false);
  assert.equal(text.includes("추가 확인이 필요한 경우"), false);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
  assert.equal(
    outputButtons(response).some((button) => button.label === "AS 접수"),
    true
  );
  assert.ok(response.template.quickReplies.length <= 4);
  assert.equal(response.template.quickReplies.at(-3).label, "AS 신청");
  assert.equal(response.template.quickReplies.at(-3).messageText, "AS 접수");
  assert.equal(response.template.quickReplies.at(-2).label, "사용 설명서");
  assert.equal(response.template.quickReplies.at(-1).label, "상담원 연결");
});

test("answers AS category requests with FAQ suggestions", () => {
  const response = buildSkillFaqResponse(data, "AS/수리 질문 보기", null, "https://example.com");
  const card = response.template.outputs[0].basicCard;

  assert.equal(response.version, "2.0");
  assert.equal(card.title, "AS/수리");
  assert.equal(card.description.includes("자주 문의하시는 항목입니다."), true);
  assert.equal(card.description.includes("전용 상담 메뉴"), false);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
  assert.ok(
    response.template.quickReplies.some((reply) =>
      reply.messageText === "AS 수거와 검수 기간은 얼마나 걸리나요?"
    )
  );
});

test("answers AS matches in the FAQ skill", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  const response = buildSkillFaqResponse(data, "AS 접수 얼마나 걸려", match, "https://example.com");
  const text = outputText(response);

  assert.equal(text.startsWith("AS 접수 후"), true);
  assert.equal(text.includes("영업일 기준 약 1~3일"), true);
  assert.equal(text.includes("전용 상담 메뉴"), false);
  assert.equal(text.includes("추가 확인이 필요한 경우"), false);
  assert.equal(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl), false);
});

test("adds Laurastar thumbnail to fallback responses", () => {
  const response = buildSkillFaqResponse(data, "모르는 질문", null, "https://example.com");

  assert.ok(response.template.outputs[0].basicCard.description.includes("질문과 바로 연결되지 않았습니다."));
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
});

test("shows frequent FAQ list for broad or unknown questions", () => {
  const response = buildSkillFaqResponse(data, "자주 묻는 질문", null, "https://example.com");
  const text = response.template.outputs[0].basicCard.description;

  assert.equal(text.includes("질문과 바로 연결되지 않았습니다."), true);
  assert.ok(response.template.quickReplies.length >= 8);
});

test("matches Woods customer wording for ambiguous support questions", () => {
  const cases = [
    ["몇평까지 가능", "woods-몇평까지-커버할수-있나요"],
    ["박스 없이 포장", "woods-AS-접수-후-박스-출고-없이-회수시-포장방법-안내"]
  ];

  for (const [query, expectedId] of cases) {
    const match = findBestFaq(woodsData, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, expectedId, query);
  }
});

test("loads Aarke FAQ brand data", () => {
  assert.equal(aarkeData.brand, "아르케 (Aarke)");
  assert.equal(aarkeData.categories.length, 6);
  assert.equal(aarkeData.flatFaqs.length, 45);
});

test("loads Litter-Robot FAQ brand data", () => {
  assert.equal(litterRobotData.brand, "리터로봇 (Litter-Robot)");
  assert.equal(litterRobotData.categories.length, 6);
  assert.equal(litterRobotData.flatFaqs.length, 56);
});

test("loads Imetec FAQ brand data", () => {
  assert.equal(imetecData.brand, "이메텍 (IMETEC)");
  assert.equal(imetecData.categories.length, 7);
  assert.equal(imetecData.flatFaqs.length, 38);
});

test("answers offline store location questions with brand store images and buttons", () => {
  const cases = [
    {
      brand: getBrandConfig("laurastar"),
      data,
      query: "로라스타 오프라인 매장 위치",
      expectedId: "laurastar-offline-store-location",
      expectedImage: "Laurastar_Offline_Store_POP.png",
      expectedLink: "https://www.laurastar.co.kr/front/storeinfo"
    },
    {
      brand: woodsBrand,
      data: woodsData,
      query: "우즈 매장 위치 알려줘",
      expectedId: "woods-offline-store-location",
      expectedImage: "Woods_Offline_Store_POP.png",
      expectedLink: "https://www.woods.co.kr/front/trialmember"
    },
    {
      brand: aarkeBrand,
      data: aarkeData,
      query: "아르케 오프라인 매장 어디야",
      expectedId: "aarke-offline-store-location",
      expectedImage: "Aarke_Offiline_Store_POP.png",
      expectedLink: "https://www.aarke.co.kr/trialmember"
    },
    {
      brand: litterRobotBrand,
      data: litterRobotData,
      query: "리터로봇 백화점 매장 체험",
      expectedId: "litter-robot-offline-store-location",
      expectedImage: "LitterRobot_Offline_Store_POP.png",
      expectedLink: "https://www.litter-robot.kr/trialmember"
    },
    {
      brand: imetecBrand,
      data: imetecData,
      query: "이메텍 오프라인 매장 안내",
      expectedId: "imetec-offline-store-location",
      expectedLink: "https://www.imetec.co.kr/front/trialmember"
    }
  ];

  for (const item of cases) {
    const match = findBestFaq(item.data, item.query);
    const response = buildSkillFaqResponse(item.data, item.query, match, "https://example.com", item.brand);

    assert.equal(match?.faq.id, item.expectedId, item.query);
    if (item.expectedImage) {
      const imageUrl = `https://example.com/assets/store/${item.expectedImage}`;
      assert.deepEqual(outputImages(response), [imageUrl], item.query);
    }
    assert.ok(
      outputButtons(response).some((button) =>
        button.label === "매장 위치 보기" && button.webLinkUrl === item.expectedLink
      ),
      item.query
    );
  }
});

test("matches Aarke customer wording for carbonation and cylinder questions", () => {
  const cases = [
    ["탄산이 예전보다 약해요", "aarke-weak-carbonation"],
    ["타사 실린더 사용 가능해?", "aarke-third-party-cylinder"],
    ["식세기에 물병 넣어도 돼요?", "aarke-pet-bottle-dishwasher"],
    ["제품 등록 어디서 하나요", "aarke-product-registration"],
    ["Carbonator 3 Pro 차이", "aarke-carbonator3-vs-pro"]
  ];

  for (const [query, expectedId] of cases) {
    const match = findBestFaq(aarkeData, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, expectedId, query);
  }
});

test("matches Litter-Robot customer wording for app, litter, hopper, lights, and parts", () => {
  const cases = [
    ["와이파이 연결이 안돼요", "litter-robot-와이파이-연결이-안돼요"],
    ["어떤 모래를 써야 하나요", "litter-robot-어떤-모래를-사용해야-하나요"],
    ["호퍼 설치 방법", "litter-robot-호퍼는-어떻게-설치하나요"],
    ["파란색 5칸 깜빡", "litter-robot-파란색-5-칸-깜빡"],
    ["라이너 어디서 구매해요", "litter-robot-라이너는-어디에서-구매해나요"],
    ["설명서 받을수 있나요", "litter-robot-설명서를-추가로-받을수-있나요"]
  ];

  for (const [query, expectedId] of cases) {
    const match = findBestFaq(litterRobotData, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, expectedId, query);
  }
});

test("matches Imetec customer wording for heat, washing, controller, and AS", () => {
  const cases = [
    ["안 따뜻해요", "imetec-너무-안-따뜻해요-불량아닌가요-온열이-없어요"],
    ["조절기 파란불 깜빡거려요", "imetec-조절기-파란불빛이-깜빡거려요-깜빡거리는-모든-문의"],
    ["조절기 구매하고 싶어요", "imetec-조절기-구매-문의"],
    ["물세탁 가능한가요", "imetec-물세탁-가능한가요"],
    ["건조기 사용 가능한가요", "imetec-탈수해도-되나요-건조기-사용-가능한가요"],
    ["전기요 AS 접수", "imetec-전기요-A-S-접수해주세요"],
    ["멀티탭 사용해도 되나요", "imetec-멀티탭-사용은-왜-안되는거죠"]
  ];

  for (const [query, expectedId] of cases) {
    const match = findBestFaq(imetecData, query);
    assert.ok(match, query);
    assert.equal(match.faq.id, expectedId, query);
  }
});

test("shows Imetec controller purchase link as a labeled button", () => {
  const match = findBestFaq(imetecData, "조절기 구매하고 싶어요");
  const response = buildSkillFaqResponse(
    imetecData,
    "조절기 구매하고 싶어요",
    match,
    "https://example.com",
    imetecBrand
  );

  assert.equal(match?.faq.id, "imetec-조절기-구매-문의");
  assert.equal(outputText(response).includes("https://"), false);
  assert.ok(
    outputButtons(response).some((button) =>
      button.label === "구매하기" &&
        button.webLinkUrl === "https://gvcurate.com/product/이메텍-전기요-전용-조절기/891/"
    )
  );
});

test("shows Litter-Robot support and purchase links as labeled buttons", () => {
  const supportMatch = findBestFaq(litterRobotData, "호퍼 설치 방법");
  const supportResponse = buildSkillFaqResponse(
    litterRobotData,
    "호퍼 설치 방법",
    supportMatch,
    "https://example.com",
    litterRobotBrand
  );

  assert.ok(
    outputButtons(supportResponse).some((button) =>
      button.label === "상세 안내" &&
        button.webLinkUrl === "https://www.litter-robot.kr/support/article/litter-robot-4-hopper-and-bonnet-installation-guide/"
    )
  );

  const purchaseMatch = findBestFaq(litterRobotData, "라이너 어디서 구매해요");
  const purchaseResponse = buildSkillFaqResponse(
    litterRobotData,
    "라이너 어디서 구매해요",
    purchaseMatch,
    "https://example.com",
    litterRobotBrand
  );

  assert.ok(
    outputButtons(purchaseResponse).some((button) => button.label === "구매하기")
  );
});

test("shows Aarke FAQ links as labeled buttons", () => {
  const match = findBestFaq(aarkeData, "제품등록은 어디서 하나요?");
  const response = buildSkillFaqResponse(
    aarkeData,
    "제품등록은 어디서 하나요?",
    match,
    "https://example.com",
    aarkeBrand
  );
  const buttons = outputButtons(response);

  assert.equal(outputText(response).includes("https://"), false);
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["제품등록"]
  );
  assert.equal(buttons[0].webLinkUrl, "https://aarke.co.kr/account?location=serialRegist");
});

test("answers product registration questions with brand registration links", () => {
  const cases = [
    {
      brand: getBrandConfig("laurastar"),
      data,
      query: "정품 등록은 어디서 하나요?",
      expectedId: "common-product-registration",
      expectedLabel: "정품등록",
      expectedLink: "https://laurastar.co.kr/front/serialregist"
    },
    {
      brand: woodsBrand,
      data: woodsData,
      query: "우즈 제품등록 어디서 해요",
      expectedId: "woods-product-registration",
      expectedLabel: "제품등록",
      expectedLink: "https://woods.co.kr/front/registuser"
    },
    {
      brand: aarkeBrand,
      data: aarkeData,
      query: "아르케 제품등록 어디서 하나요",
      expectedId: "aarke-product-registration",
      expectedLabel: "제품등록",
      expectedLink: "https://aarke.co.kr/account?location=serialRegist"
    }
  ];

  for (const item of cases) {
    const match = findBestFaq(item.data, item.query);
    const response = buildSkillFaqResponse(item.data, item.query, match, "https://example.com", item.brand);

    assert.equal(match?.faq.id, item.expectedId, item.query);
    assert.ok(
      outputButtons(response).some((button) =>
        button.label === item.expectedLabel && button.webLinkUrl === item.expectedLink
      ),
      item.query
    );
  }
});

test("matches review-requested natural customer phrases", () => {
  const cases = [
    [data, "물 뭐 써야돼", "common-water-type"],
    [data, "물이 뚝뚝 떨어져요", "common-first-water-drop"],
    [data, "새제품 물이 더러워요", "common-first-residue"],
    [data, "보스랑 잇지 뭐 달라", "izzi-boss-edition"],
    [data, "AS 신청 어디서 해", "as-before-check"],
    [woodsData, "작동 안돼요", "woods-작동이-안돼요"],
    [woodsData, "물비움 불이 계속 떠요", "woods-수조를-비웠는데-물비움-표시등이-점등돼요"],
    [woodsData, "물통에서 물이 새요", "woods-제품에서-물이-새요"],
    [woodsData, "필터 청소는 어떻게", "woods-필터-관리는-어떻게-하나요"],
    [aarkeData, "사용법 알려줘", "aarke-how-to-use"],
    [aarkeData, "물 뭐 넣어야 돼", "aarke-water-type"],
    [aarkeData, "윙윙 소리가 안나요", "aarke-carbonator3-no-humming"],
    [aarkeData, "가스 실린더 어디서 사요", "aarke-refill-cylinder-purchase"],
    [aarkeData, "가스리필 신청합니다", "aarke-refill-cylinder-purchase"],
    [aarkeData, "실린더충전 접수", "aarke-refill-cylinder-purchase"],
    [aarkeData, "실린덜 충전 접수", "aarke-refill-cylinder-purchase"],
    [aarkeData, "실린더 리필 접수하고 싶어요", "aarke-refill-cylinder-purchase"],
    [aarkeData, "가스 충전 신청", "aarke-refill-cylinder-purchase"],
    [imetecData, "조절기 깜빡거려요", "imetec-조절기-파란불빛이-깜빡거려요-깜빡거리는-모든-문의"],
    [imetecData, "따뜻하지 않아요", "imetec-너무-안-따뜻해요-불량아닌가요-온열이-없어요"]
  ];

  for (const [brandData, query, expectedId] of cases) {
    const match = findBestFaq(brandData, query);
    assert.equal(match?.faq.id, expectedId, query);
  }
});

test("applies completed worksheet mappings for stores, products, and troubleshooting", () => {
  const cases = [
    [data, "롯데 본점에도 매장이 있어?", "laurastar-offline-store-location"],
    [woodsData, "가까운 매장 어디예요?", "woods-offline-store-location"],
    [aarkeData, "팝업 매장 알려줘", "aarke-offline-store-location"],
    [litterRobotData, "리터로봇 오프라인 매장 위치", "litter-robot-offline-store-location"],
    [imetecData, "이메텍 백화점 매장 어디야", "imetec-offline-store-location"],
    [aarkeData, "추가 제품 구입은 어디서", "aarke-product-purchase"],
    [aarkeData, "물이 뿜어져요", "aarke-water-splashing"],
    [aarkeData, "바닥에 물이 고여요", "aarke-leak-during-carbonation"],
    [data, "AS 진행하고 싶습니다", "as-before-check"],
    [data, "필터 사용기한", "izzi-lift-filter-replacement"],
    [data, "스팀이 안나와요", "common-no-steam-diagnostic"],
    [data, "코드 선이 자동으로 들어가지 않아요", "izzi-lift-cord-lock"],
    [data, "나사가 안 왔어요", "delivery-components-separate"],
    [woodsData, "작동되다가 수시로 꺼져요", "woods-작동이-안돼요"],
    [woodsData, "필터 교체", "woods-필터-교환은-어떻게-하나요"],
    [woodsData, "습도 확인", "woods-습도-조절-단계별-습도가-어떻게-되나요-습도-조절-레버"]
  ];

  for (const [brandData, query, expectedId] of cases) {
    assert.equal(findBestFaq(brandData, query)?.faq.id, expectedId, query);
  }
});

test("asks the worksheet clarification questions with targeted quick replies", () => {
  const cylinderQuery = "실린더 한 통으로 얼마나 써요?";
  const cylinderMatch = findBestFaq(aarkeData, cylinderQuery);
  const cylinderResponse = buildSkillFaqResponse(
    aarkeData,
    cylinderQuery,
    cylinderMatch,
    "https://example.com",
    aarkeBrand
  );

  assert.equal(cylinderMatch?.faq.id, "aarke-cylinder-clarification");
  assert.deepEqual(
    cylinderResponse.template.quickReplies.map((reply) => reply.label),
    ["실린더 사용량", "충전 실린더 구매"]
  );

  const waterQuery = "물을 다시 넣어도 계속 물부족불이 들어와요";
  const waterMatch = findBestFaq(data, waterQuery);
  const waterResponse = buildSkillFaqResponse(data, waterQuery, waterMatch, "https://example.com");

  assert.equal(waterMatch?.faq.id, "laurastar-water-warning-model-clarification");
  assert.deepEqual(
    waterResponse.template.quickReplies.map((reply) => reply.label),
    ["Smart", "IZZI", "Lift"]
  );
});

test("routes worksheet deferred and private requests to a human", () => {
  const cases = [
    [data, "AS 회수 이후 진행 상황이 궁금합니다"],
    [woodsData, "검수결과"],
    [woodsData, "a/s결과 알고싶습니다"],
    [data, "민원"],
    [data, "그건 아닌거 같거"],
    [data, "저 입금 완료 했어요"],
    [data, "물통분실구매"],
    [data, "사용 중 누전이 됐어요"],
    [data, "팬이 돌다가 멈춰요"],
    [data, "물샘증상"],
    [data, "스팀 카트 불량 빨리 처리해주세요"],
    [woodsData, "42 맥스기능?"],
    [woodsData, "https://talk.kakaocdn.net/example.jpg"]
  ];

  for (const [brandData, query] of cases) {
    const match = findBestFaq(brandData, query);
    assert.equal(match?.faq.id, "base-human-handoff", query);
  }
});

test("handles common worksheet conversation messages", () => {
  const thanks = findBestFaq(data, "감사합니다");
  const thanksResponse = buildSkillFaqResponse(data, "감사합니다", thanks, "https://example.com");
  assert.equal(thanks?.faq.id, "base-thanks");
  assert.equal(outputText(thanksResponse).includes("좋은 하루 되세요"), true);

  const insufficient = findBestFaq(data, "문의");
  const insufficientResponse = buildSkillFaqResponse(data, "문의", insufficient, "https://example.com");
  assert.equal(insufficient?.faq.id, "base-insufficient-detail");
  assert.equal(outputText(insufficientResponse).includes("조금 더 구체적으로 입력"), true);

  assert.equal(findBestFaq(litterRobotData, "")?.faq.id, "base-insufficient-detail");
  assert.equal(findBestFaq(woodsData, "제습기문의해요")?.faq.id, "base-insufficient-detail");
  assert.equal(findBestFaq(litterRobotData, "4 문의")?.faq.id, "base-insufficient-detail");
});

test("matches recently observed unmatched production questions", () => {
  const cases = [
    [data, "원래 필터가 잘 빠지나요?", "lift-filter-not-fixed"],
    [data, "물도 많은데 빨간불이 들어와요", "laurastar-water-warning-model-clarification"],
    [litterRobotData, "회전하다 멈춤", "litter-robot-파란색-5-칸-plus-흰색-5-칸-교차"],
    [litterRobotData, "허퍼오류", "litter-robot-호퍼-설치-후-모터-걸림-오류가-발생했어요"],
    [litterRobotData, "호퍼오류", "litter-robot-호퍼-설치-후-모터-걸림-오류가-발생했어요"]
  ];

  for (const [brandData, query, expectedId] of cases) {
    assert.equal(findBestFaq(brandData, query)?.faq.id, expectedId, query);
  }
});

test("merges duplicate Litter-Robot questions and normalizes light wording", () => {
  const questionKeys = litterRobotData.flatFaqs.map((faq) => faq.question.replace(/\s+/g, ""));
  assert.equal(new Set(questionKeys).size, questionKeys.length);

  const weight = findBestFaq(litterRobotData, "고양이 몸무게가 제대로 측정되지 않아요");
  assert.equal(weight?.faq.id, "litter-robot-고양이-몸무게가-제대로-측정되지-않아요");
  assert.equal(weight.faq.answer.includes("inaccurate-cat-weight"), true);
  assert.equal(weight.faq.answer.includes("calibrating-omnisense"), true);

  const lightCases = ["파란불 다섯칸 깜빡여", "파랑 5개 점멸"];
  for (const query of lightCases) {
    assert.equal(
      findBestFaq(litterRobotData, query)?.faq.id,
      "litter-robot-파란색-5-칸-깜빡",
      query
    );
  }

  const mergedPattern = findBestFaq(litterRobotData, "파란색 3칸 고정 + 노란색 2칸 깜빡");
  assert.equal(mergedPattern?.faq.id, "litter-robot-파란색-3-칸-고정-plus-노란색-2-칸");
  assert.equal(mergedPattern.faq.answer.includes("과도한 무게"), true);
  assert.equal(mergedPattern.faq.answer.includes("평평한 바닥"), true);
});

test("asks for a Woods model before model-specific answers", () => {
  const match = findBestFaq(woodsData, "작동이 안돼요");
  const response = buildSkillFaqResponse(woodsData, "작동이 안돼요", match, "https://example.com", woodsBrand);
  const text = outputText(response);

  assert.equal(text.startsWith("어떤 모델을 사용하고 계신가요?"), true);
  assert.equal(text.includes("어떤 모델을 사용하고 계신가요?"), true);
  assert.deepEqual(
    response.template.quickReplies.map((reply) => reply.label),
    ["SW30FW PRO", "SW22FW", "SW42FW", "WCD4PRO"]
  );
  assert.equal(response.template.quickReplies[1].messageText, "SW22FW 작동이 안돼요");
});

test("answers Woods model-specific FAQ when model is in the utterance", () => {
  const match = findBestFaq(woodsData, "SW22FW 작동이 안돼요");
  const response = buildSkillFaqResponse(
    woodsData,
    "SW22FW 작동이 안돼요",
    match,
    "https://example.com",
    woodsBrand
  );
  const text = outputText(response);

  assert.equal(text.startsWith("1. 상품을 사용하시는 위치가"), true);
  assert.equal(text.includes("습도 조절 레버를 최대 위치(MAX)로 설정합니다."), true);
  assert.equal(response.template.quickReplies.some((reply) => reply.label === "SW22FW"), false);
  assert.ok(response.template.quickReplies.some((reply) => reply.label === "AS 접수"));
});

test("shows FAQ links as buttons instead of raw URLs", () => {
  const match = findBestFaq(woodsData, "SW30FW 필터 구매");
  const response = buildSkillFaqResponse(
    woodsData,
    "SW30FW 필터 구매",
    match,
    "https://example.com",
    woodsBrand
  );
  const text = outputText(response);
  const buttons = outputButtons(response);

  assert.equal(text.startsWith("아래 버튼에서 확인해 주세요."), true);
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes("아래 버튼에서 확인해 주세요."), true);
  assert.equal(response.template.outputs[0].simpleText.text.includes("아래 버튼에서 확인해 주세요."), true);
  assert.ok(buttons.some((button) => button.action === "webLink" && button.label === "구매하기"));
  assert.ok(buttons.some((button) => button.webLinkUrl.includes("brand.naver.com/woods")));
});

test("uses answer lines as labels for multiple FAQ link buttons", () => {
  const match = findBestFaq(woodsData, "SW22FW 필터 구매");
  const response = buildSkillFaqResponse(
    woodsData,
    "SW22FW 필터 구매",
    match,
    "https://example.com",
    woodsBrand
  );
  const buttons = outputButtons(response);

  assert.equal(outputText(response).includes("https://"), false);
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["단품 구매", "세트 구매"]
  );
});

test("answers Woods model spec questions with spec images", () => {
  const cases = [
    ["SW30FW 스펙 이미지", "SW30FW PRO 스펙 이미지입니다.", "spec-sw-30fw-pro.jpeg"],
    ["SW22FW 스펙 이미지", "SW22FW 스펙 이미지입니다.", "spec-sw22fw.jpeg"],
    ["SW42FW 제원표", "SW42FW 스펙 이미지입니다.", "spec-sw42fx.jpeg"],
    ["WCD4PRO 스팩", "WCD4PRO 스펙 이미지입니다.", "spec-wcd4pro.jpeg"]
  ];

  for (const [query, expectedText, expectedImage] of cases) {
    const match = findBestFaq(woodsData, query);
    const response = buildSkillFaqResponse(woodsData, query, match, "https://example.com", woodsBrand);

    assert.equal(match.faq.id, "woods-모델별-스펙-이미지");
    assert.equal(response.template.outputs[0].simpleText.text, expectedText);
    assert.equal(
      response.template.outputs[1].simpleImage.imageUrl,
      `https://example.com/faq_images/woods/spec/${expectedImage}`
    );
    assert.equal(response.template.outputs[1].simpleImage.altText.includes("스펙 이미지"), true);
  }
});

test("asks for a Woods model before showing spec images", () => {
  const match = findBestFaq(woodsData, "스펙 이미지");
  const response = buildSkillFaqResponse(woodsData, "스펙 이미지", match, "https://example.com", woodsBrand);

  assert.equal(match.faq.id, "woods-모델별-스펙-이미지");
  assert.equal(response.template.outputs[0].simpleText.text, "어떤 모델의 스펙을 확인하시겠습니까?");
  assert.deepEqual(
    response.template.quickReplies.map((reply) => reply.label),
    ["SW30FW PRO", "SW22FW", "SW42FW", "WCD4PRO"]
  );
});

test("answers Woods drain hose connection questions with model images", () => {
  const sw30Match = findBestFaq(woodsData, "SW30FW 배수 호스는 어떻게 연결하나요");
  const sw30Response = buildSkillFaqResponse(
    woodsData,
    "SW30FW 배수 호스는 어떻게 연결하나요",
    sw30Match,
    "https://example.com",
    woodsBrand
  );
  const sw22Match = findBestFaq(woodsData, "SW22FW 배수 호스는 어떻게 연결하나요");
  const sw22Response = buildSkillFaqResponse(
    woodsData,
    "SW22FW 배수 호스는 어떻게 연결하나요",
    sw22Match,
    "https://example.com",
    woodsBrand
  );

  assert.equal(sw30Match.faq.id, "woods-배수-호스는--어떻게-연결하나요");
  assert.deepEqual(
    sw30Response.template.outputs.flatMap((output) => output.simpleImage?.imageUrl || []),
    [
      "https://example.com/faq_images/woods/func/30-connector-hose.jpeg",
      "https://example.com/faq_images/woods/func/all-connector-hose.jpeg"
    ]
  );
  assert.deepEqual(
    sw22Response.template.outputs.flatMap((output) => output.simpleImage?.imageUrl || []),
    ["https://example.com/faq_images/woods/func/all-connector-hose.jpeg"]
  );
});

test("answers Woods styrofoam and light-color questions with images", () => {
  const styrofoamMatch = findBestFaq(woodsData, "수조에 있는 하얀색 스티로폼이 무엇인가요");
  const styrofoamResponse = buildSkillFaqResponse(
    woodsData,
    "수조에 있는 하얀색 스티로폼이 무엇인가요",
    styrofoamMatch,
    "https://example.com",
    woodsBrand
  );
  const lightMatch = findBestFaq(woodsData, "SW30FW 점등되는 색상이 다른데 무슨 뜻인가요");
  const lightResponse = buildSkillFaqResponse(
    woodsData,
    "SW30FW 점등되는 색상이 다른데 무슨 뜻인가요",
    lightMatch,
    "https://example.com",
    woodsBrand
  );

  assert.equal(styrofoamMatch.faq.id, "woods-수조에-있는-하얀색-스티로폼이-무엇인가요");
  assert.equal(
    styrofoamResponse.template.outputs[1].simpleImage.imageUrl,
    "https://example.com/faq_images/woods/func/styrofoam.jpeg"
  );
  assert.equal(lightMatch.faq.id, "woods-점등되는-색상이-다른데-무슨-뜻인가요");
  assert.equal(
    lightResponse.template.outputs[1].simpleImage.imageUrl,
    "https://example.com/faq_images/woods/func/30-flash-light.jpeg"
  );
});

test("serves Woods Kakao skill route", async () => {
  const req = new EventEmitter();
  req.method = "POST";
  req.url = "https://example.com/skill/woods/faq";
  req.headers = {
    host: "example.com",
    "content-type": "application/json"
  };

  let statusCode = null;
  let rawBody = "";
  const res = {
    writeHead(status, headers) {
      statusCode = status;
      this.headers = headers;
    },
    end(body) {
      rawBody = body;
    }
  };

  const routePromise = serverRoute(req, res);
  req.emit(
    "data",
    Buffer.from(
      JSON.stringify({
        userRequest: {
          utterance: "SW42FW 몇평까지 가능"
        }
      })
    )
  );
  req.emit("end");
  await routePromise;

  const body = JSON.parse(rawBody);
  assert.equal(statusCode, 200);
  assert.equal(body.version, "2.0");
  assert.equal(body.template.outputs[0].simpleText.text.startsWith("58평형입니다."), true);
});

test("serves Aarke Kakao skill route", async () => {
  const request = new Request("https://example.com/skill/aarke/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "탄산이 예전보다 약해요"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.version, "2.0");
  assert.equal(body.template.outputs[0].simpleText.text.startsWith("먼저 세 가지를 확인해 주세요."), true);
  assert.ok(body.template.quickReplies.some((reply) => reply.label === "실린더 구매"));
});

test("asks for brand selection on the unified Kakao skill route", async () => {
  const req = new EventEmitter();
  req.method = "POST";
  req.url = "https://example.com/skill/faq";
  req.headers = {
    host: "example.com",
    "content-type": "application/json"
  };

  let statusCode = null;
  let rawBody = "";
  const res = {
    writeHead(status, headers) {
      statusCode = status;
      this.headers = headers;
    },
    end(body) {
      rawBody = body;
    }
  };

  const routePromise = serverRoute(req, res);
  req.emit(
    "data",
    Buffer.from(
      JSON.stringify({
        userRequest: {
          utterance: "AS 접수 얼마나 걸려"
        }
      })
    )
  );
  req.emit("end");
  await routePromise;

  const body = JSON.parse(rawBody);
  assert.equal(statusCode, 200);
  assert.equal(body.version, "2.0");
  assert.equal(body.template.outputs[0].basicCard.title, "브랜드 선택");
  assert.equal(
    body.template.outputs[0].basicCard.thumbnail.imageUrl,
    "https://example.com/assets/Gatevision_Chatbot_Intro.png"
  );
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["로라스타", "우즈", "아르케", "리터로봇", "이메텍", "다른 브랜드"]
  );
  assert.equal(body.template.quickReplies[0].messageText, "[브랜드:laurastar] AS 접수 얼마나 걸려");
  assert.equal(body.template.quickReplies[1].messageText, "[브랜드:woods] AS 접수 얼마나 걸려");
  assert.equal(body.template.quickReplies[2].messageText, "[브랜드:aarke] AS 접수 얼마나 걸려");
  assert.equal(body.template.quickReplies[3].messageText, "[브랜드:litter-robot] AS 접수 얼마나 걸려");
  assert.equal(body.template.quickReplies[4].messageText, "[브랜드:imetec] AS 접수 얼마나 걸려");
  assert.equal(body.template.quickReplies[5].messageText, "상담원 연결");
});

test("answers after a brand is selected on the unified Kakao skill route", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "[브랜드:woods] SW42FW 몇평까지 가능"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.version, "2.0");
  assert.equal(body.template.outputs[0].simpleText.text.startsWith("58평형입니다."), true);
  assert.deepEqual(
    body.template.quickReplies.slice(-2).map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
  assert.equal(body.template.quickReplies.at(-2).messageText, "상담원 연결");
});

test("shows the support menu immediately after choosing a brand", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: { id: "brand-welcome-user" },
        utterance: "[브랜드:aarke]"
      }
    })
  });

  const response = await workerRoute(request, { KAKAO_RESPONSE_LAYOUT: "v2" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs[0].listCard.header.title.includes("아르케"), true);
  assert.deepEqual(
    body.template.outputs[0].listCard.items.map((item) => item.title),
    [
      "제품관련 문의",
      "교환/환불 문의",
      "AS 문의",
      "구매 문의",
      "기타"
    ]
  );
  assert.ok(body.template.outputs[0].listCard.items.every((item) => item.action === "message"));
  assert.ok(body.template.outputs[0].listCard.items.every((item) => item.extra?.supportMenuId));
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
  assert.ok(body.template.quickReplies.every((reply) => reply.action === "message"));
});

test("opens product families from the support menu without typed input", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: { id: "support-product-menu-user" },
        utterance: "[브랜드:woods] 제품관련 문의"
      },
      action: {
        params: {},
        clientExtra: {
          brand: "woods",
          supportMenuId: "product"
        }
      }
    })
  });

  const response = await workerRoute(request, { KAKAO_RESPONSE_LAYOUT: "v2" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs[0].textCard.title, "제품관련 문의");
  assert.deepEqual(
    body.template.outputs[1].listCard.items.map((item) => item.title),
    ["제습기", "가습기"]
  );
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["메인 메뉴", "상담사 연결", "브랜드 변경"]
  );
});

test("shows product families and frequent questions when no FAQ matches", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: { id: "unmatched-product-family-user" },
        utterance: "[브랜드:aarke] 오늘 점심 메뉴 추천해줘"
      },
      action: { params: {} }
    })
  });

  const response = await workerRoute(request, { KAKAO_RESPONSE_LAYOUT: "v2" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs.length, 3);
  assert.equal(body.template.outputs[0].textCard.title, "답변을 찾지 못했어요");
  assert.deepEqual(
    body.template.outputs[1].listCard.items.map((item) => item.title),
    ["탄산수 제조기", "전용 보틀", "CO2 실린더"]
  );
  assert.equal(
    body.template.outputs[1].listCard.items[0].extra.productFamilyId,
    "carbonator"
  );
  assert.equal(body.template.outputs[2].listCard.items.length, 5);
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});

test("shows scoped FAQs after selecting a product family", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: { id: "product-family-selection-user" },
        utterance: "[브랜드:aarke] 탄산수 제조기 문의"
      },
      action: {
        params: {},
        clientExtra: {
          brand: "aarke",
          productFamilyId: "carbonator"
        }
      }
    })
  });

  const response = await workerRoute(request, { KAKAO_RESPONSE_LAYOUT: "v2" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs[0].textCard.title, "탄산수 제조기");
  assert.equal(body.template.outputs[1].listCard.items.length, 5);
  assert.ok(
    body.template.outputs[1].listCard.items.every((item) => item.action === "message")
  );
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});

test("keeps the confirmed Woods and Imetec product-family lists", () => {
  assert.deepEqual(
    getBrandConfig("woods").productFamilies.map((item) => item.name),
    ["제습기", "가습기"]
  );
  assert.deepEqual(
    getBrandConfig("imetec").productFamilies.map((item) => item.name),
    ["전기요", "전기담요", "히팅패드"]
  );
});

test("routes a product family without linked FAQs to guided support", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: { id: "woods-humidifier-selection-user" },
        utterance: "[브랜드:woods] 가습기 문의"
      },
      action: {
        params: {},
        clientExtra: {
          brand: "woods",
          productFamilyId: "humidifier"
        }
      }
    })
  });

  const response = await workerRoute(request, { KAKAO_RESPONSE_LAYOUT: "v2" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs.length, 1);
  assert.equal(body.template.outputs[0].textCard.title, "가습기");
  assert.equal(body.template.outputs[0].textCard.description.includes("연결된 자주 묻는 질문이 없습니다"), true);
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});

test("answers Litter-Robot after a brand is selected on the unified Kakao skill route", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "[브랜드:litter-robot] 와이파이 연결이 안돼요"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.version, "2.0");
  assert.equal(
    body.template.outputs[0].simpleText.text.includes("2.4GHz WiFi 신호"),
    true
  );
  assert.deepEqual(
    body.template.quickReplies.slice(-2).map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});

test("answers Imetec after a brand is selected on the unified Kakao skill route", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "[브랜드:imetec] 조절기 파란불 깜빡거려요"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.version, "2.0");
  assert.equal(
    body.template.outputs[0].simpleText.text.includes("온도조절기 깜빡임 증상"),
    true
  );
  assert.deepEqual(
    body.template.quickReplies.slice(-2).map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});


test("keeps all model choices on unified skill model-selection responses", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        utterance: "[브랜드:woods] 스펙 이미지"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs[0].simpleText.text, "어떤 모델의 스펙을 확인하시겠습니까?");
  assert.deepEqual(
    body.template.quickReplies.map((reply) => reply.label),
    ["SW30FW PRO", "SW22FW", "SW42FW", "WCD4PRO"]
  );
});

test("uses Kakao brand params on the unified skill route", async () => {
  const request = new Request("https://example.com/skill/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: {
        params: {
          brand: "woods",
          utterance: "SW22FW 작동이 안돼요"
        }
      },
      userRequest: {
        utterance: "발화 내용"
      }
    })
  });

  const response = await workerRoute(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.template.outputs[0].simpleText.text.startsWith("1. 상품을 사용하시는 위치가"), true);
});

test("keeps the selected brand for later unified skill questions", async () => {
  const user = {
    id: "brand-session-user-1"
  };

  const selectResponse = await workerRoute(
    new Request("https://example.com/skill/faq", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userRequest: {
          user,
          utterance: "[브랜드:woods] SW42FW 몇평까지 가능"
        }
      })
    })
  );
  assert.equal(selectResponse.status, 200);

  const nextResponse = await workerRoute(
    new Request("https://example.com/skill/faq", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userRequest: {
          user,
          utterance: "SW22FW 작동이 안돼요"
        }
      })
    })
  );
  const nextBody = await nextResponse.json();

  assert.equal(nextResponse.status, 200);
  assert.equal(nextBody.template.outputs[0].simpleText.text.startsWith("1. 상품을 사용하시는 위치가"), true);
  assert.deepEqual(
    nextBody.template.quickReplies.slice(-2).map((reply) => reply.label),
    ["상담사 연결", "브랜드 변경"]
  );
});

test("persists each supported brand on the unified skill route", async () => {
  const cases = [
    {
      brand: "laurastar",
      firstQuery: "정품등록은 어디서 하나요?",
      nextQuery: "IGGI 마개가 안열려요",
      expectedText: "강제로 열지 말고 AS 접수를 권장합니다"
    },
    {
      brand: "woods",
      firstQuery: "SW42FW 몇평까지 가능",
      nextQuery: "SW22FW 필터 청소",
      expectedText: "평균적으로 1년에 한번 교체"
    },
    {
      brand: "aarke",
      firstQuery: "가스리필 신청합니다",
      nextQuery: "구입했는데 장품등록을 어떻게 하나오",
      expectedText: "아래 제품등록 페이지에서 등록할 수 있습니다"
    },
    {
      brand: "litter-robot",
      firstQuery: "와이파이 연결이 안돼요",
      nextQuery: "파란색 5칸 깜빡",
      expectedText: "폐기물 서랍이 가득 찼다는 뜻"
    },
    {
      brand: "imetec",
      firstQuery: "안 따뜻해요",
      nextQuery: "물세탁 가능한가요",
      expectedText: "40도 전후의 미지근한 온도의 물"
    }
  ];

  for (const item of cases) {
    const user = { id: `brand-session-matrix-${item.brand}` };
    const selectResponse = await workerRoute(
      new Request("https://example.com/skill/faq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userRequest: {
            user,
            utterance: `[브랜드:${item.brand}] ${item.firstQuery}`
          }
        })
      })
    );
    assert.equal(selectResponse.status, 200, item.brand);

    const nextResponse = await workerRoute(
      new Request("https://example.com/skill/faq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userRequest: {
            user,
            utterance: item.nextQuery
          }
        })
      })
    );
    const nextBody = await nextResponse.json();

    assert.equal(nextResponse.status, 200, item.brand);
    assert.equal(outputText(nextBody).includes(item.expectedText), true, item.brand);
    assert.equal(nextBody.template.quickReplies.at(-1).label, "브랜드 변경", item.brand);
  }
});

test("applies shared matching and typo normalization on every dedicated brand skill route", async () => {
  const cases = [
    ["laurastar", "IGGI 마개가 안열려요", "강제로 열지 말고 AS 접수를 권장합니다"],
    ["woods", "SW22FW 필터 청소", "평균적으로 1년에 한번 교체"],
    ["aarke", "구입했는데 장품등록을 어떻게 하나오", "아래 제품등록 페이지에서 등록할 수 있습니다"],
    ["litter-robot", "파란색 5칸 깜빡", "폐기물 서랍이 가득 찼다는 뜻"],
    ["imetec", "조절기 파란불 깜빡", "온도조절기 깜빡임 증상"]
  ];

  for (const [brand, utterance, expectedText] of cases) {
    const response = await workerRoute(
      new Request(`https://example.com/skill/${brand}/faq`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userRequest: { utterance } })
      })
    );
    const body = await response.json();

    assert.equal(response.status, 200, brand);
    assert.equal(outputText(body).includes(expectedText), true, brand);
  }
});

test("clears the selected brand when the user asks to change brands", async () => {
  const user = {
    id: "brand-session-user-2"
  };

  await workerRoute(
    new Request("https://example.com/skill/faq", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userRequest: {
          user,
          utterance: "[브랜드:woods] SW42FW 몇평까지 가능"
        }
      })
    })
  );

  const clearResponse = await workerRoute(
    new Request("https://example.com/skill/faq", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userRequest: {
          user,
          utterance: "브랜드 변경"
        }
      })
    })
  );
  const clearBody = await clearResponse.json();

  assert.equal(clearResponse.status, 200);
  assert.equal(clearBody.template.outputs[0].basicCard.title, "브랜드 선택");
  assert.equal(
    clearBody.template.outputs[0].basicCard.thumbnail.imageUrl,
    "https://example.com/assets/Gatevision_Chatbot_Intro.png"
  );

  const nextResponse = await workerRoute(
    new Request("https://example.com/skill/faq", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userRequest: {
          user,
          utterance: "SW22FW 작동이 안돼요"
        }
      })
    })
  );
  const nextBody = await nextResponse.json();

  assert.equal(nextResponse.status, 200);
  assert.equal(nextBody.template.outputs[0].basicCard.title, "브랜드 선택");
});

test("writes FAQ history to Supabase through the Worker env", async () => {
  const requests = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_FETCH: async (url, options) => {
      requests.push({ url, options });
      return new Response(null, { status: 201 });
    }
  };
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    }
  };
  const request = new Request("https://example.com/skill/woods/faq", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userRequest: {
        user: {
          id: "user-1"
        },
        utterance: "SW42FW 몇평까지 가능"
      }
    })
  });

  const response = await workerRoute(request, env, ctx);
  await Promise.all(waitUntilPromises);

  assert.equal(response.status, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.supabase.co/rest/v1/faq_history");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.apikey, "service-role-key");

  const row = JSON.parse(requests[0].options.body);
  assert.equal(row.brand, "woods");
  assert.match(row.occurred_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/u);
  assert.equal(row.user_id, "user-1");
  assert.equal(row.query, "SW42FW 몇평까지 가능");
  assert.equal(row.query_normalized, "sw42fw 몇평까지 가능");
  assert.equal(row.query_length, 14);
  assert.equal(row.faq_id, "woods-몇평까지-커버할수-있나요");
  assert.equal(row.selected_model, "SW42FW");
  assert.deepEqual(row.metadata, {
    kakaoUserType: null,
    timezone: null,
    lang: null,
    isFriend: null,
    menuId: "product",
    productFamilyId: null,
    confidence: "high",
    result: "matched"
  });
});

test("reports missing Worker history secrets on health check", async () => {
  const response = await workerRoute(new Request("https://example.com/health"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.history, {
    configured: false,
    sink: "console",
    missingSecrets: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
  });
});

test("reports configured Worker Supabase history sink on health check", async () => {
  const response = await workerRoute(
    new Request("https://example.com/health"),
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
    }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.history, {
    configured: true,
    sink: "supabase",
    missingSecrets: []
  });
});

function visualConfig(brand) {
  return { ...brand, responseLayout: "v2" };
}

function componentButtons(output) {
  return [
    ...(output.textCard?.buttons || []),
    ...(output.basicCard?.buttons || []),
    ...(output.carousel?.items || []).flatMap((item) => item.buttons || [])
  ];
}

function assertKakaoVisualLimits(response) {
  assert.equal(response.version, "2.0");
  assert.ok(response.template.outputs.length >= 1);
  assert.ok(response.template.outputs.length <= 3);
  assert.ok(response.template.quickReplies.length <= 10);
  assert.ok(response.template.quickReplies.every((reply) => reply.label.length <= 14));

  for (const output of response.template.outputs) {
    assert.ok(output.textCard || output.simpleImage || output.basicCard || output.carousel);
    if (output.simpleImage) {
      assert.ok(output.simpleImage.imageUrl.startsWith("https://"));
      assert.ok(output.simpleImage.altText.length <= 50);
    }
    if (output.textCard) {
      assert.ok(output.textCard.title.length <= 50);
      assert.ok(output.textCard.title.length + output.textCard.description.length <= 400);
      assert.ok((output.textCard.buttons || []).length <= 3);
      assert.equal(output.textCard.description.includes("https://"), false);
    }
    if (output.basicCard) {
      assert.ok(output.basicCard.title.length <= 50);
      assert.ok(output.basicCard.description.length <= 230);
      assert.ok((output.basicCard.buttons || []).length <= 3);
      assert.equal(output.basicCard.description.includes("https://"), false);
    }
    if (output.carousel) {
      assert.equal(output.carousel.type, "basicCard");
      assert.ok(output.carousel.items.length <= 10);
      assert.ok(output.carousel.items.every((item) => item.buttons?.length <= 3 || !item.buttons));
    }
  }
}

test("builds bounded Kakao text cards and image carousels", () => {
  const card = textCard({
    title: "가".repeat(80),
    description: "나".repeat(500),
    buttons: Array.from({ length: 5 }, (_, index) => ({ label: String(index) }))
  });
  const carousel = imageCardCarousel([
    "https://example.com/1.png",
    "https://example.com/2.png"
  ]);

  assert.equal(card.textCard.title.length, 50);
  assert.ok(card.textCard.title.length + card.textCard.description.length <= 400);
  assert.equal(card.textCard.buttons.length, 3);
  assert.equal(carousel.carousel.items.length, 2);
  assert.equal(carousel.carousel.items[0].thumbnail.link.web, "https://example.com/1.png");
  assert.equal(carousel.carousel.items[0].buttons[0].label, "이미지 전체보기");
});

test("renders the five visual response prototypes", () => {
  const cases = [
    {
      brand: aarkeBrand,
      query: "아르케 탄산수 기기는 어떻게 사용하나요?",
      id: "aarke-how-to-use",
      component: "textCard",
      title: "아르케 탄산수 기기 사용법",
      quickReply: "자세히 보기"
    },
    {
      brand: litterRobotBrand,
      query: "글로브 라이너는 어디에서 구매해나요?",
      id: "litter-robot-글로브-라이너는-어디에서-구매해나요",
      component: "textCard",
      title: "글로브 라이너 구매",
      button: "구매하기"
    },
    {
      brand: imetecBrand,
      query: "전기요 AS 접수",
      id: "imetec-전기요-A-S-접수해주세요",
      component: "textCard",
      title: "이메텍 전기요 A/S 접수",
      button: "AS 접수",
      quickReply: "자세히 보기"
    },
    {
      brand: woodsBrand,
      query: "작동이 안돼요",
      id: "woods-작동이-안돼요",
      component: "textCard",
      title: "작동이 안돼요",
      modelReplies: ["SW30FW PRO", "SW22FW", "SW42FW", "WCD4PRO"]
    },
    {
      brand: aarkeBrand,
      query: "아르케 오프라인 매장은 어디에 있나요?",
      id: "aarke-offline-store-location",
      component: "basicCard",
      title: "아르케 오프라인 매장",
      button: "매장 위치 보기"
    }
  ];

  for (const item of cases) {
    const match = findBestFaq(item.brand.data, item.query);
    const response = buildSkillFaqResponse(
      item.brand.data,
      item.query,
      match,
      "https://example.com",
      visualConfig(item.brand)
    );
    const first = response.template.outputs[0][item.component];

    assert.equal(match?.faq.id, item.id, item.query);
    assert.equal(first.title, item.title, item.query);
    if (item.button) {
      assert.ok(response.template.outputs.flatMap(componentButtons).some((button) => button.label === item.button));
    }
    if (item.quickReply) {
      assert.ok(response.template.quickReplies.some((reply) => reply.label === item.quickReply));
    }
    if (item.modelReplies) {
      assert.deepEqual(response.template.quickReplies.map((reply) => reply.label), item.modelReplies);
    }
    assertKakaoVisualLimits(response);
  }
});

test("shows long answers progressively without losing the detail action", () => {
  const match = findBestFaq(imetecData, "전기요 AS 접수");
  const summary = buildSkillFaqResponse(
    imetecData,
    "전기요 AS 접수",
    match,
    "https://example.com",
    visualConfig(imetecBrand)
  );
  const detailReply = summary.template.quickReplies.find((reply) => reply.label === "자세히 보기");
  const rematch = findBestFaq(imetecData, detailReply.messageText);
  const detail = buildSkillFaqResponse(
    imetecData,
    detailReply.messageText,
    rematch,
    "https://example.com",
    visualConfig(imetecBrand)
  );
  const detailText = detail.template.outputs.map((output) => output.textCard?.description || "").join("\n");

  assert.equal(rematch?.faq.id, match?.faq.id);
  assert.equal(detail.template.outputs.length, 3);
  assert.equal(detailText.includes("접수 전 준비"), true);
  assert.equal(detailText.includes("고객 과실 확인 항목"), true);
  assert.equal(detailText.includes("검수 결과 안내"), true);
  assert.equal(detail.template.quickReplies.some((reply) => reply.label === "자세히 보기"), false);
  assertKakaoVisualLimits(detail);
});

test("shows multiple FAQ explanation images as native Kakao image bubbles", () => {
  const query = "SW30FW 배수 호스는 어떻게 연결하나요";
  const match = findBestFaq(woodsData, query);
  const response = buildSkillFaqResponse(
    woodsData,
    query,
    match,
    "https://example.com",
    visualConfig(woodsBrand)
  );
  const imageOutputs = response.template.outputs.filter((output) => output.simpleImage);

  assert.equal(match?.faq.id, "woods-배수-호스는--어떻게-연결하나요");
  assert.ok(response.template.outputs[0].textCard);
  assert.equal(imageOutputs.length, 2);
  assert.deepEqual(
    imageOutputs.map((output) => output.simpleImage.imageUrl),
    [
      "https://example.com/faq_images/woods/func/30-connector-hose.jpeg",
      "https://example.com/faq_images/woods/func/all-connector-hose.jpeg"
    ]
  );
  assertKakaoVisualLimits(response);
});

test("shows every explanation image inside Kakao and keeps store images as linked cards", () => {
  for (const brand of [
    getBrandConfig("laurastar"),
    woodsBrand,
    aarkeBrand,
    litterRobotBrand,
    imetecBrand
  ]) {
    for (const faq of brand.data.flatFaqs) {
      const models = faq.answer_type === "per_model"
        ? (faq.available_models || Object.keys(faq.model_answers || {}))
        : [null];

      for (const model of models) {
        const modelAnswer = model ? faq.model_answers?.[model] : null;
        const imagePaths = modelAnswer?.imagePaths || faq.imagePaths ||
          (modelAnswer?.imagePath || faq.imagePath ? [modelAnswer?.imagePath || faq.imagePath] : []);
        if (!imagePaths.length) continue;

        const query = [model, faq.question].filter(Boolean).join(" ");
        const response = buildSkillFaqResponse(
          brand.data,
          query,
          { faq, score: 999 },
          "https://example.com",
          visualConfig(brand)
        );
        const cards = response.template.outputs.flatMap((output) => [
          ...(output.basicCard ? [output.basicCard] : []),
          ...(output.carousel?.items || [])
        ]);
        const inChatImages = response.template.outputs
          .filter((output) => output.simpleImage)
          .map((output) => output.simpleImage.imageUrl);
        const expectedUrls = imagePaths.map((imagePath) =>
          new URL(imagePath, "https://example.com").toString()
        );
        const storeImages = expectedUrls.every((imageUrl) =>
          new URL(imageUrl).pathname.startsWith("/assets/store/")
        );

        if (storeImages) {
          assert.deepEqual(
            cards.map((card) => card.thumbnail.link.web),
            expectedUrls,
            `${brand.key}:${faq.id}:${model || "common"}`
          );
        } else {
          assert.deepEqual(
            inChatImages,
            expectedUrls,
            `${brand.key}:${faq.id}:${model || "common"}`
          );
          assert.equal(cards.length, 0);
        }
      }
    }
  }
});

test("ranks related questions by the current customer journey", () => {
  const specMatch = findBestFaq(woodsData, "SW22FW 스펙 이미지");
  const related = getContextualRelatedFaqs(
    woodsData,
    specMatch.faq,
    "SW22FW 스펙 이미지",
    { selectedModel: "SW22FW", limit: 3 }
  );

  assert.equal(related[0].id, "woods-습도-조절-단계별-습도가-어떻게-되나요-습도-조절-레버");
  assert.ok(related.every((faq) =>
    faq.answer_type !== "per_model" || faq.available_models.includes("SW22FW")
  ));

  const response = buildSkillFaqResponse(
    woodsData,
    "SW22FW 스펙 이미지",
    specMatch,
    "https://example.com",
    visualConfig(woodsBrand)
  );
  const relatedReply = response.template.quickReplies[0];

  assert.ok(relatedReply.label.length <= 14);
  assert.match(relatedReply.messageText, /^SW22FW /u);
});

test("uses curated summaries for every answer longer than 240 characters", () => {
  let longAnswerCount = 0;

  for (const brand of [
    getBrandConfig("laurastar"),
    woodsBrand,
    aarkeBrand,
    litterRobotBrand,
    imetecBrand
  ]) {
    for (const faq of brand.data.flatFaqs) {
      const answers = faq.answer_type === "per_model"
        ? Object.entries(faq.model_answers || {})
        : [[null, {
            answer: faq.answer,
            imagePaths: faq.imagePaths,
            presentation: faq.presentation
          }]];

      for (const [model, answer] of answers) {
        if (String(answer.answer || "").length <= 240) continue;
        longAnswerCount += 1;
        const presentation = normalizeFaqPresentation(faq, {
          ...answer,
          selectedModel: model
        });

        assert.ok(presentation.summary.length <= 200, `${brand.key}:${faq.id}:${model || "common"}`);
      }
    }
  }

  assert.equal(longAnswerCount, 36);
});

test("classifies unmatched history for the FAQ improvement queue", () => {
  const entry = createFaqHistoryEntry({
    brand: imetecBrand,
    method: "POST",
    path: "/skill/faq",
    source: "test",
    query: "환불 받고 싶어요",
    payload: {
      action: {
        clientExtra: {
          productFamilyId: "heating-pad"
        }
      }
    },
    match: null
  });

  assert.equal(entry.metadata.menuId, "exchange-refund");
  assert.equal(entry.metadata.productFamilyId, "heating-pad");
  assert.equal(entry.metadata.confidence, "unmatched");
  assert.equal(entry.metadata.result, "unmatched");

  const analyticsSql = fs.readFileSync(
    new URL("../sql/faq_history.sql", import.meta.url),
    "utf8"
  );
  assert.match(analyticsSql, /faq_history_unmatched_queries/u);
  assert.match(analyticsSql, /query_count_7d/u);
  assert.match(analyticsSql, /faq_history_improvement_queue/u);
});

test("keeps every FAQ visual response within Kakao limits", () => {
  for (const brand of [
    getBrandConfig("laurastar"),
    woodsBrand,
    aarkeBrand,
    litterRobotBrand,
    imetecBrand
  ]) {
    for (const faq of brand.data.flatFaqs) {
      const models = faq.answer_type === "per_model"
        ? [null, ...(faq.available_models || Object.keys(faq.model_answers || {}))]
        : [null];

      for (const model of models) {
        const query = [model, faq.question].filter(Boolean).join(" ");
        const match = { faq, score: 999 };
        const response = buildSkillFaqResponse(
          brand.data,
          query,
          match,
          "https://example.com",
          visualConfig(brand)
        );
        assertKakaoVisualLimits(response);

        const detailReply = response.template.quickReplies.find((reply) => reply.label === "자세히 보기");
        if (detailReply) {
          const detail = buildSkillFaqResponse(
            brand.data,
            detailReply.messageText,
            match,
            "https://example.com",
            visualConfig(brand)
          );
          assertKakaoVisualLimits(detail);
        }
      }
    }
  }
});

test("activates the visual layout only through the Worker feature flag", async () => {
  const requestBody = JSON.stringify({ userRequest: { utterance: "전기요 AS 접수" } });
  const legacyResponse = await workerRoute(new Request("https://example.com/skill/imetec/faq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody
  }));
  const visualResponse = await workerRoute(new Request("https://example.com/skill/imetec/faq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody
  }), { KAKAO_RESPONSE_LAYOUT: "v2" });
  const legacyBody = await legacyResponse.json();
  const visualBody = await visualResponse.json();

  assert.ok(legacyBody.template.outputs[0].simpleText);
  assert.ok(visualBody.template.outputs[0].textCard);
});

test("records isFriend in FAQ history metadata", async () => {
  const requests = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_FETCH: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(null, { status: 201 });
    }
  };

  // 1. Friend user
  await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "스마트 u m i 차이가 뭐야",
          user: {
            id: "friend-user-1",
            properties: { isFriend: true }
          }
        }
      })
    }),
    env
  );

  // 2. Non-friend user
  await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "스마트 u m i 차이가 뭐야",
          user: {
            id: "non-friend-user-2",
            properties: { isFriend: false }
          }
        }
      })
    }),
    env
  );

  // 3. Unknown user (no properties)
  await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "스마트 u m i 차이가 뭐야",
          user: { id: "unknown-user-3" }
        }
      })
    }),
    env
  );

  assert.equal(requests.length, 3);
  assert.equal(requests[0].body.metadata.isFriend, true);
  assert.equal(requests[1].body.metadata.isFriend, false);
  assert.equal(requests[2].body.metadata.isFriend, null);
});

test("prompts channel friend benefit in quick replies only for non-friend users", async () => {
  const nonFriendResponse = await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "스팀이 안 나와요",
          user: {
            id: "non-friend-user",
            properties: { isFriend: false }
          }
        }
      })
    }),
    { KAKAO_RESPONSE_LAYOUT: "v2" }
  );
  const nonFriendBody = await nonFriendResponse.json();
  const nonFriendLabels = nonFriendBody.template.quickReplies.map((r) => r.label);
  assert.ok(nonFriendLabels.includes("채널 추가 혜택"));

  const friendResponse = await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "스팀이 안 나와요",
          user: {
            id: "friend-user",
            properties: { isFriend: true }
          }
        }
      })
    }),
    { KAKAO_RESPONSE_LAYOUT: "v2" }
  );
  const friendBody = await friendResponse.json();
  const friendLabels = friendBody.template.quickReplies.map((r) => r.label);
  assert.ok(!friendLabels.includes("채널 추가 혜택"));
});

test("returns dedicated channel friend benefit response on channel benefit utterance", async () => {
  const response = await workerRoute(
    new Request("https://example.com/skill/woods/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "채널 추가 혜택 알려줘"
        }
      })
    })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  const card = body.template.outputs[0].basicCard || body.template.outputs[0].textCard;
  assert.ok(card);
  assert.ok(card.title.includes("우즈"));
  assert.ok(card.title.includes("채널 추가 혜택 안내"));
  assert.ok(card.description.includes("SMF 항균 필터"));
  assert.ok(card.description.includes("[Ch+]"));
  assert.ok(card.buttons.some((b) => b.label === "공식몰 바로가기"));
});

test("builds Kakao button action helpers (operator, phone, share, block)", () => {
  const operator = operatorButton();
  assert.deepEqual(operator, {
    action: "operator",
    label: "상담원 연결"
  });

  const customOperator = operatorButton("1:1 상담톡 연결하기 (글자수 제한 테스트)");
  assert.equal(customOperator.action, "operator");
  assert.ok(customOperator.label.length <= 14);

  const phone = phoneButton("고객센터 전화", "1899-7505");
  assert.deepEqual(phone, {
    action: "phone",
    label: "고객센터 전화",
    phoneNumber: "1899-7505"
  });

  const share = shareButton();
  assert.deepEqual(share, {
    action: "share",
    label: "답변 공유하기"
  });

  const block = blockButton("상세 조회", "block-id-123", { param: "test" });
  assert.deepEqual(block, {
    action: "block",
    label: "상세 조회",
    blockId: "block-id-123",
    extra: { param: "test" }
  });
});

test("builds Kakao itemCard with bounded lists and summaries", () => {
  const card = itemCard({
    title: "스펙 비교",
    description: "스마트 시리즈 모델별 차이",
    itemList: [
      { title: "Smart I", description: "기본형 스팀다리미" },
      { title: "Smart M", description: "블루투스 연동 및 자동 스팀" },
      { title: "Smart U", description: "최상위 플래그십 모델" }
    ],
    itemListSummary: {
      title: "공통 스펙",
      description: "DMS 미세 건식 스팀 3.5 bar"
    },
    buttons: [
      operatorButton("상담원 연결"),
      phoneButton("고객센터", "1899-7505")
    ]
  });

  assert.ok(card.itemCard);
  assert.equal(card.itemCard.title, "스펙 비교");
  assert.equal(card.itemCard.itemList.length, 3);
  assert.equal(card.itemCard.itemList[0].title, "Smart I");
  assert.equal(card.itemCard.itemListSummary.title, "공통 스펙");
  assert.equal(card.itemCard.buttons.length, 2);
  assert.equal(card.itemCard.buttons[0].action, "operator");
  assert.equal(card.itemCard.buttons[1].action, "phone");
});

test("renders fallback response with operator and customer service phone buttons", async () => {
  const response = await workerRoute(
    new Request("https://example.com/skill/laurastar/faq", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userRequest: {
          utterance: "완전히 알수없는 질문입니다 xyz123"
        }
      })
    }),
    { KAKAO_RESPONSE_LAYOUT: "v2" }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  const card = body.template.outputs[0].textCard;
  assert.ok(card);
  assert.ok(card.buttons.some((b) => b.action === "operator"));
  assert.ok(card.buttons.some((b) => b.action === "phone" && b.phoneNumber === "1899-7505"));
});

test("renders itemCard when presentation defines itemList", () => {
  const faqWithItemList = {
    id: "test-item-card-faq",
    question: "모델별 스펙 비교",
    answer: "Smart 시리즈 스펙 안내입니다.",
    presentation: {
      title: "Smart 시리즈 비교",
      summary: "모델별 주요 기능 요약입니다.",
      itemList: [
        { title: "Smart I", description: "기본 모델" },
        { title: "Smart M", description: "자동 스팀" }
      ],
      itemListSummary: {
        title: "권장",
        description: "가정용 최적화"
      },
      actions: [
        { type: "operator", label: "상담원 연결" }
      ]
    }
  };

  const response = buildSkillFaqResponse(
    data,
    "모델별 스펙 비교",
    { faq: faqWithItemList, score: 999 },
    "https://example.com",
    { key: "laurastar", responseLayout: "v2" }
  );

  assert.ok(response.template.outputs[0].itemCard);
  assert.equal(response.template.outputs[0].itemCard.itemList.length, 2);
  assert.equal(response.template.outputs[0].itemCard.itemList[0].title, "Smart I");
  assert.equal(response.template.outputs[0].itemCard.buttons[0].action, "operator");
});

test("attaches shareButton when FAQ or presentation is shareable", () => {
  const shareableFaq = {
    id: "test-shareable-faq",
    question: "석회질 제거 및 청소 방법",
    answer: "보일러 온도가 내려간 뒤 마개를 열고 세척액을 주입하세요.",
    shareable: true,
    links: []
  };

  const response = buildSkillFaqResponse(
    data,
    "석회질 제거 및 청소 방법",
    { faq: shareableFaq, score: 999 },
    "https://example.com",
    { key: "laurastar", responseLayout: "v2" }
  );

  const card = response.template.outputs[0].textCard;
  assert.ok(card);
  assert.ok(card.buttons.some((b) => b.action === "share" && b.label === "답변 공유하기"));
});

test("builds carouselHeader and includes header in basicCardCarousel", () => {
  const header = carouselHeader({
    title: "로라스타 제품 라인업",
    description: "올인원 시스템부터 핸디 스티머까지 한눈에 비교해 보세요.",
    imageUrl: "https://example.com/assets/laurastar-intro.png",
    altText: "로라스타 제품 모음"
  });

  assert.deepEqual(header, {
    title: "로라스타 제품 라인업",
    description: "올인원 시스템부터 핸디 스티머까지 한눈에 비교해 보세요.",
    thumbnail: {
      imageUrl: "https://example.com/assets/laurastar-intro.png",
      altText: "로라스타 제품 모음"
    }
  });

  const carousel = basicCardCarousel(
    [
      { title: "Smart U", description: "플래그십 모델", thumbnail: "https://example.com/smart-u.png" },
      { title: "Smart M", description: "블루투스 연동", thumbnail: "https://example.com/smart-m.png" }
    ],
    { header }
  );

  assert.ok(carousel.carousel);
  assert.equal(carousel.carousel.type, "basicCard");
  assert.ok(carousel.carousel.header);
  assert.equal(carousel.carousel.header.title, "로라스타 제품 라인업");
  assert.equal(carousel.carousel.items.length, 2);
});

test("supports fixedRatio: true (1:1 square) and altText on basicCard and carousel items", () => {
  const singleCard = basicCard({
    title: "IGGI 휴대용 스티머",
    description: "99.9% 살균 스팀케어",
    thumbnail: "https://example.com/iggi.png",
    fixedRatio: true,
    altText: "IGGI 레드 제품 사진"
  });

  assert.equal(singleCard.basicCard.thumbnail.fixedRatio, true);
  assert.equal(singleCard.basicCard.thumbnail.altText, "IGGI 레드 제품 사진");

  const imageCarousel = imageCardCarousel(
    [
      { imageUrl: "https://example.com/img1.png", altText: "설명 1" },
      { imageUrl: "https://example.com/img2.png", altText: "설명 2" }
    ],
    {
      title: "사용 가이드",
      fixedRatio: true,
      header: {
        title: "사용 순서 안내",
        description: "좌우로 넘겨 단계별 사진을 확인하세요.",
        imageUrl: "https://example.com/cover.png"
      }
    }
  );

  assert.ok(imageCarousel.carousel.header);
  assert.equal(imageCarousel.carousel.header.title, "사용 순서 안내");
  assert.equal(imageCarousel.carousel.items[0].thumbnail.fixedRatio, true);
  assert.equal(imageCarousel.carousel.items[0].thumbnail.altText, "설명 1");
  assert.equal(imageCarousel.carousel.items[1].thumbnail.fixedRatio, true);
  assert.equal(imageCarousel.carousel.items[1].thumbnail.altText, "설명 2");
});

test("matches 42 natural customer queries across 5 brands with 100% accuracy", () => {
  const testCases = [
    // Laurastar
    { brand: "laurastar", query: "물 뭐 써야돼", expectedFaqId: "common-water-type" },
    { brand: "laurastar", query: "어떤 물 넣어요?", expectedFaqId: "common-water-type" },
    { brand: "laurastar", query: "수돗물 써도 되나요", expectedFaqId: "common-water-type" },
    { brand: "laurastar", query: "생수 써도 돼요?", expectedFaqId: "common-water-type" },
    { brand: "laurastar", query: "물이 뚝뚝 떨어져요", expectedFaqId: "common-first-water-drop" },
    { brand: "laurastar", query: "새제품 물이 더러워요", expectedFaqId: "common-first-residue" },
    { brand: "laurastar", query: "보스랑 잇지 뭐 달라", expectedFaqId: "izzi-boss-edition" },
    { brand: "laurastar", query: "AS 신청 어디서 해", expectedFaqId: "as-before-check" },
    { brand: "laurastar", query: "매장 좀 알려줘", expectedFaqId: "laurastar-offline-store-location" },
    { brand: "laurastar", query: "스팀이 안 나와요", expectedFaqId: "common-no-steam-diagnostic" },
    { brand: "laurastar", query: "예열 시간 얼마나 걸려요", expectedFaqId: "common-preheat-time" },
    { brand: "laurastar", query: "정품 등록 어디서 해요", expectedFaqId: "common-product-registration" },

    // Woods
    { brand: "woods", query: "작동 안돼요", expectedFaqId: "woods-작동이-안돼요" },
    { brand: "woods", query: "물비움 불이 계속 떠요", expectedFaqId: "woods-수조를-비웠는데-물비움-표시등이-점등돼요" },
    { brand: "woods", query: "물통에서 물이 새요", expectedFaqId: "woods-제품에서-물이-새요" },
    { brand: "woods", query: "필터 청소는 어떻게", expectedFaqId: "woods-필터-관리는-어떻게-하나요" },
    { brand: "woods", query: "소음이 너무 심해요", expectedFaqId: "woods-소음이-커요" },
    { brand: "woods", query: "연속 배수 가능한가요", expectedFaqId: "woods-연속-배수-가능한가요" },
    { brand: "woods", query: "배수 호스 어디서 사요", expectedFaqId: "woods-배수-호스는-어디에서-구매할수-있나요" },
    { brand: "woods", query: "제습기에서 물이 샙니다", expectedFaqId: "woods-제품에서-물이-새요" },

    // Aarke
    { brand: "aarke", query: "가스리필 신청합니다", expectedFaqId: "aarke-refill-cylinder-purchase" },
    { brand: "aarke", query: "충전 실린더 어디서 사요", expectedFaqId: "aarke-refill-cylinder-purchase" },
    { brand: "aarke", query: "리필 실린더 주문하고 싶어요", expectedFaqId: "aarke-refill-cylinder-purchase" },
    { brand: "aarke", query: "구입했는데 장품등록을 어떻게 하나오", expectedFaqId: "aarke-product-registration" },
    { brand: "aarke", query: "정품 등록 어디서 해요?", expectedFaqId: "aarke-product-registration" },
    { brand: "aarke", query: "사용법 알려줘", expectedFaqId: "aarke-how-to-use" },
    { brand: "aarke", query: "탄산수 만드는법", expectedFaqId: "aarke-how-to-use" },
    { brand: "aarke", query: "물 뭐 넣어야 돼", expectedFaqId: "aarke-water-type" },
    { brand: "aarke", query: "윙윙 소리가 안나요", expectedFaqId: "aarke-carbonator3-no-humming" },
    { brand: "aarke", query: "물이 뿜어져요", expectedFaqId: "aarke-water-splashing" },
    { brand: "aarke", query: "탄산 넣을 때 물이 새요", expectedFaqId: "aarke-leak-during-carbonation" },

    // Litter-Robot
    { brand: "litter-robot", query: "아기고양이도 써도돼", expectedFaqId: "litter-robot-어린-고양이도-사용할수-있나요" },
    { brand: "litter-robot", query: "고양이 몇키로까지", expectedFaqId: "litter-robot-몸무게-제한이-있나요" },
    { brand: "litter-robot", query: "체중이 자꾸 다르게 나와", expectedFaqId: "litter-robot-고양이-몸무게가-제대로-측정되지-않아요" },
    { brand: "litter-robot", query: "호퍼 모래 자동공급 안돼", expectedFaqId: "litter-robot-호퍼를-설치했는데-모래-자동-공급이-되지-않아요" },
    { brand: "litter-robot", query: "와이파이 연결 어떻게 해요", expectedFaqId: "litter-robot-와이파이-연결이-안돼요" },
    { brand: "litter-robot", query: "모래는 어떤걸 써야 하나요", expectedFaqId: "litter-robot-어떤-모래를-사용해야-하나요" },

    // Imetec
    { brand: "imetec", query: "전기요 세탁 어떻게 하나요", expectedFaqId: "imetec-물세탁-가능한가요" },
    { brand: "imetec", query: "물세탁 되나요", expectedFaqId: "imetec-물세탁-가능한가요" },
    { brand: "imetec", query: "온열이 안 올라와요", expectedFaqId: "imetec-너무-안-따뜻해요-불량아닌가요-온열이-없어요" },
    { brand: "imetec", query: "전기요 AS 접수", expectedFaqId: "imetec-전기요-A-S-접수해주세요" },
    { brand: "imetec", query: "온도조절기에 빨간불이 깜빡여요", expectedFaqId: "imetec-조절기-파란불빛이-깜빡거려요-깜빡거리는-모든-문의" }
  ];

  for (const tc of testCases) {
    const brand = getBrandConfig(tc.brand);
    const match = findBestFaq(brand.data, tc.query);
    assert.ok(match, `Expected query "${tc.query}" to match an FAQ for brand ${tc.brand}`);
    assert.equal(match.faq.id, tc.expectedFaqId, `Query "${tc.query}" matched wrong FAQ`);
    assert.ok(match.score > 0, `Expected positive match score for "${tc.query}"`);
  }
});

test("ensures all FAQs longer than 400 characters have curated summaries within Kakao limits", () => {
  const brands = ["laurastar", "woods", "aarke", "litter-robot", "imetec"];

  for (const brandKey of brands) {
    const brand = getBrandConfig(brandKey);
    for (const faq of brand.data.flatFaqs) {
      const rawAnswer = faq.answer || "";
      if (rawAnswer.length > 400) {
        const pres = normalizeFaqPresentation(faq, { answer: rawAnswer });
        assert.ok(pres.summary, `FAQ ${faq.id} in ${brandKey} must have a non-empty summary`);
        assert.ok(pres.summary.length <= 240, `Summary for FAQ ${faq.id} (${pres.summary.length} chars) exceeds 240 chars limit`);
        assert.equal(pres.summary.endsWith("…"), false, `FAQ ${faq.id} summary must be human-curated, not auto-truncated with ellipsis`);
        assert.equal(pres.hasDetails, true, `FAQ ${faq.id} must indicate hasDetails: true`);
      }
    }
  }
});

test("generates disambiguation confirmation questions with quick replies when multiple FAQs tie", () => {
  const filterMatch = findBestFaq(woodsData, "필터");
  assert.ok(filterMatch, "Expected match for 필터 query");
  assert.equal(filterMatch.faq.id, "disambiguation-필터");
  const filterResponse = buildSkillFaqResponse(woodsData, "필터", filterMatch, "https://example.com", woodsBrand);
  assert.ok(filterResponse.template.quickReplies.length >= 2, "Expected multiple quick replies for 필터 disambiguation");
  assert.ok(filterResponse.template.quickReplies.some((r) => r.label.includes("필터를 꼭")));

  const controllerMatch = findBestFaq(imetecData, "조절기");
  assert.ok(controllerMatch, "Expected match for 조절기 query");
  assert.equal(controllerMatch.faq.id, "disambiguation-조절기");

  const steamMatch = findBestFaq(data, "스팀");
  assert.ok(steamMatch, "Expected match for 스팀 query");
  assert.equal(steamMatch.faq.id, "disambiguation-스팀");
});

test("intelligently resolves model abbreviations without re-prompting for model selection", () => {
  const sw30Query = "sw30 뜨거워요";
  const sw30Match = findBestFaq(woodsData, sw30Query);
  assert.ok(sw30Match, "Expected match for sw30 뜨거워요");
  const sw30Response = buildSkillFaqResponse(woodsData, sw30Query, sw30Match, "https://example.com", woodsBrand);
  const sw30Text = outputText(sw30Response);
  assert.ok(sw30Text.includes("압축기는 돌지만"), "Expected SW30FW PRO specific answer text");
  assert.equal(sw30Text.includes("사용 중인 모델을 선택"), false, "Should NOT re-prompt for model selection");

  const sw22Query = "sw22 뜨거워요";
  const sw22Match = findBestFaq(woodsData, sw22Query);
  assert.ok(sw22Match, "Expected match for sw22 뜨거워요");
  const sw22Response = buildSkillFaqResponse(woodsData, sw22Query, sw22Match, "https://example.com", woodsBrand);
  const sw22Text = outputText(sw22Response);
  assert.ok(sw22Text.includes("우즈 소재가 철이기때문에"), "Expected SW22FW specific answer text");
  assert.equal(sw22Text.includes("사용 중인 모델을 선택"), false, "Should NOT re-prompt for model selection");
});

test("preserves single-syllable verb stems and resolves action-oriented queries accurately", () => {
  const cases = [
    { brandData: woodsData, query: "필터 어떻게 갈아요", expectedId: "woods-필터-교환은-어떻게-하나요" },
    { brandData: imetecData, query: "전기요 어떻게 빨아요", expectedId: "imetec-물세탁-가능한가요" },
    { brandData: aarkeData, query: "실린더 어디서 사요", expectedId: "aarke-refill-cylinder-purchase" },
    { brandData: woodsData, query: "배수호스 어디서 사요", expectedId: "woods-배수-호스는-어디에서-구매할수-있나요" },
    { brandData: woodsData, query: "필터 어디서 사요", expectedId: "woods-필터는-어디에서-구매하나요" },
    { brandData: woodsData, query: "필터 청소 어떻게 해요", expectedId: "woods-필터-관리는-어떻게-하나요" },
    { brandData: imetecData, query: "전기요 세탁 어떻게 하나요", expectedId: "imetec-물세탁-가능한가요" },
    { brandData: data, query: "생수 써도 돼요", expectedId: "common-water-type" },
    { brandData: data, query: "물이 안 들어가요", expectedId: "smart-water-not-moving" },
    { brandData: aarkeData, query: "물 뭐 넣어야 돼", expectedId: "aarke-water-type" }
  ];

  for (const { brandData, query, expectedId } of cases) {
    const match = findBestFaq(brandData, query);
    assert.ok(match, `Expected match for query: ${query}`);
    assert.equal(match.faq.id, expectedId, `Query "${query}" should match ${expectedId}`);
  }
});

test("provides contextual journey recommendations across 5 brands", () => {
  // 1. Laurastar: after water type inquiry, recommends cartridge replacement
  const waterMatch = findBestFaq(data, "어떤 물을 사용해야 하나요");
  assert.ok(waterMatch);
  const laurastarRelated = getContextualRelatedFaqs(data, waterMatch.faq, "어떤 물을 사용해야 하나요");
  assert.ok(laurastarRelated.length >= 2, "Expected at least 2 related FAQs for Laurastar");
  assert.ok(
    laurastarRelated.some(
      (f) =>
        f.id === "common-anti-scale-cartridge" ||
        f.id.includes("filter") ||
        f.question.includes("필터") ||
        f.question.includes("카트리지")
    ),
    "Expected filter/cartridge replacement follow-up"
  );

  // 2. Imetec: after washing inquiry, recommends drying or controller detachment
  const washMatch = findBestFaq(imetecData, "전기요 어떻게 빨아요");
  assert.ok(washMatch);
  const imetecRelated = getContextualRelatedFaqs(imetecData, washMatch.faq, "전기요 어떻게 빨아요");
  assert.ok(imetecRelated.length >= 1, "Expected at least 1 related FAQ for Imetec");

  // 3. Aarke: after how-to-use inquiry, recommends water or cylinder
  const useMatch = findBestFaq(aarkeData, "아르케 탄산수 기기는 어떻게 사용하나요?");
  assert.ok(useMatch);
  const aarkeRelated = getContextualRelatedFaqs(aarkeData, useMatch.faq, "기기 사용법");
  assert.ok(aarkeRelated.length >= 1, "Expected at least 1 related FAQ for Aarke");

  // 4. Litter-Robot: after sand inquiry, recommends related follow-ups
  const sandMatch = findBestFaq(litterRobotData, "어떤 모래를 사용해야 하나요?");
  assert.ok(sandMatch);
  const litterRelated = getContextualRelatedFaqs(litterRobotData, sandMatch.faq, "어떤 모래를 사용해야 하나요?");
  assert.ok(litterRelated.length >= 1, "Expected at least 1 related FAQ for Litter-Robot");

  // 5. Woods: after humidity control inquiry, recommends continuous drainage
  const humidMatch = findBestFaq(woodsData, "습도 조절 단계별 습도가 어떻게 되나요");
  assert.ok(humidMatch);
  const woodsRelated = getContextualRelatedFaqs(woodsData, humidMatch.faq, "습도 조절 레버");
  assert.ok(woodsRelated.length >= 1, "Expected at least 1 related FAQ for Woods");
});

test("correctly resolves historical unmatched customer queries from production logs", () => {
  const cases = [
    { brandData: aarkeData, query: "카보네이트3 페트병", expectedId: "disambiguation-카보네이트3페트병" },
    { brandData: data, query: "스팀분사", expectedId: "disambiguation-스팀분사" },
    { brandData: data, query: "스팀분서", expectedId: "disambiguation-스팀분서" },
    { brandData: data, query: "제품사용중인데 최근들어 다림질이 거의 안되서 연락드려요", expectedId: "common-no-steam-diagnostic" },
    { brandData: data, query: "몇번을 왔다갔다해도 구김현상이 그대로에요 뭐가 문제일까요?", expectedId: "common-no-steam-diagnostic" },
    { brandData: data, query: "스팀은안나오고 열만 되요", expectedId: "common-no-steam-diagnostic" },
    { brandData: data, query: "물 흐름", expectedId: "smart-water-not-moving" },
    { brandData: data, query: "스마트사용중인데 녹물이나와요", expectedId: "common-first-residue" },
    { brandData: data, query: "물비움", expectedId: "izzi-lift-clean-boiler" },
    { brandData: data, query: "안빼고 닫아서 보관함", expectedId: "iggi-cap-storage" },
    { brandData: data, query: "실크도 가능한가요?", expectedId: "base-human-handoff" },
    { brandData: woodsData, query: "공구가로요 별주부님 인스타로구매했어요", expectedId: "base-human-handoff" },
    { brandData: woodsData, query: "네 확인되면 꼭 알려주세요~~", expectedId: "base-human-handoff" },
    { brandData: woodsData, query: "ㅁ에ㅔ", expectedId: null }
  ];

  for (const { brandData, query, expectedId } of cases) {
    const match = findBestFaq(brandData, query);
    const actualId = match?.faq?.id || null;
    assert.equal(actualId, expectedId, `Query "${query}" expected ${expectedId}, got ${actualId}`);
  }
});

test("infers target types accurately for all button and destination URLs", () => {
  assert.equal(inferTargetType("https://www.laurastar.co.kr/front/board/cswrite?brand=laurastar", "AS 접수"), "AS_FORM");
  assert.equal(inferTargetType("https://laurastar.co.kr/front/serialregist", "정품등록"), "PRODUCT_REGISTRATION");
  assert.equal(inferTargetType("https://www.youtube.com/watch?v=12345", "설명서 영상"), "VIDEO_MANUAL");
  assert.equal(inferTargetType("https://www.laurastar.co.kr/front/board/manual", "매뉴얼"), "MANUAL");
  assert.equal(inferTargetType("https://gvcurate.com/product/detail.html?product_no=764", "실린더 구매"), "PURCHASE");
  assert.equal(inferTargetType("https://www.gatevision.co.kr/front/customerservice", "고객센터"), "CUSTOMER_SERVICE");
  assert.equal(inferTargetType("https://www.gatevision.co.kr/front/storeinfo", "매장 위치 보기"), "STORE_LOCATION");
  assert.equal(inferTargetType("https://www.litter-robot.kr/support/", "지원센터"), "SUPPORT");
  assert.equal(inferTargetType("https://external-unknown-site.com", "외부 사이트"), "EXTERNAL");
});

test("builds tracked redirect URLs with parameters and skips asset images", () => {
  const tracked = buildTrackedUrl("https://gv-chatbots.example.com", "https://gvcurate.com/product/123", {
    brand: "aarke",
    faqId: "aarke-refill",
    label: "실린더 구매",
    userId: "kakao_user_99"
  });

  const parsed = new URL(tracked);
  assert.equal(parsed.origin, "https://gv-chatbots.example.com");
  assert.equal(parsed.pathname, "/track/click");
  assert.equal(parsed.searchParams.get("target"), "https://gvcurate.com/product/123");
  assert.equal(parsed.searchParams.get("brand"), "aarke");
  assert.equal(parsed.searchParams.get("faqId"), "aarke-refill");
  assert.equal(parsed.searchParams.get("label"), "실린더 구매");
  assert.equal(parsed.searchParams.get("type"), "PURCHASE");
  assert.equal(parsed.searchParams.get("userId"), "kakao_user_99");

  // Skip images
  assert.equal(
    buildTrackedUrl("https://example.com", "https://example.com/assets/photo.jpg"),
    "https://example.com/assets/photo.jpg"
  );
  assert.equal(
    buildTrackedUrl("https://example.com", "/assets/store/store.png"),
    "/assets/store/store.png"
  );

  // Prevent double wrapping
  assert.equal(buildTrackedUrl("https://gv-chatbots.example.com", tracked), tracked);
});

test("serves /track/click redirect and records click history in Supabase", async () => {
  const requests = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_FETCH: async (url, options) => {
      requests.push({ url, options });
      return new Response("", { status: 201 });
    }
  };

  const reqUrl = "https://example.com/track/click?target=" +
    encodeURIComponent("https://woods.co.kr/front/registuser") +
    "&brand=woods&faqId=woods-regist&label=" +
    encodeURIComponent("제품등록") +
    "&userId=test-user-123";

  const request = new Request(reqUrl, {
    method: "GET",
    headers: {
      "user-agent": "KakaoTalk/10.0.0",
      "cf-connecting-ip": "1.2.3.4"
    }
  });

  const response = await workerRoute(request, env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://woods.co.kr/front/registuser");

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.supabase.co/rest/v1/faq_history");
  const row = JSON.parse(requests[0].options.body);
  assert.equal(row.brand, "woods");
  assert.equal(row.source, "link_click");
  assert.equal(row.path, "/track/click");
  assert.equal(row.user_id, "test-user-123");
  assert.equal(row.query, "제품등록");
  assert.equal(row.faq_id, "woods-regist");
  assert.equal(row.metadata.eventType, "LINK_CLICK");
  assert.equal(row.metadata.targetUrl, "https://woods.co.kr/front/registuser");
  assert.equal(row.metadata.targetType, "PRODUCT_REGISTRATION");
  assert.equal(row.metadata.ip, "1.2.3.4");
  assert.equal(row.metadata.userAgent, "KakaoTalk/10.0.0");
});

test("safely handles invalid or missing target in /track/click", async () => {
  const env = {};
  const responseNoTarget = await workerRoute(new Request("https://example.com/track/click"), env);
  assert.equal(responseNoTarget.status, 302);
  assert.equal(responseNoTarget.headers.get("location"), "https://www.gatevision.co.kr");

  const responseBadTarget = await workerRoute(
    new Request("https://example.com/track/click?target=javascript:alert(1)"),
    env
  );
  assert.equal(responseBadTarget.status, 302);
  assert.equal(responseBadTarget.headers.get("location"), "https://www.gatevision.co.kr");
});

test("serves /track/event and records custom action event", async () => {
  const requests = [];
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_FETCH: async (url, options) => {
      requests.push({ url, options });
      return new Response("", { status: 201 });
    }
  };

  const request = new Request("https://example.com/track/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType: "HANDOFF_CLICK",
      brand: "laurastar",
      userId: "user-999",
      label: "상담사 연결",
      faqId: "base-human-handoff",
      metadata: { referrer: "quick_reply" }
    })
  });

  const response = await workerRoute(request, env);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);

  assert.equal(requests.length, 1);
  const row = JSON.parse(requests[0].options.body);
  assert.equal(row.brand, "laurastar");
  assert.equal(row.source, "action_event");
  assert.equal(row.user_id, "user-999");
  assert.equal(row.metadata.eventType, "HANDOFF_CLICK");
  assert.equal(row.metadata.referrer, "quick_reply");
});

test("wraps outbound links with click tracking when ENABLE_LINK_TRACKING is enabled", async () => {
  const request = new Request("https://example.com/skill/aarke/faq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userRequest: {
        user: { id: "aarke-tracker-user" },
        utterance: "실린더 충전 구매"
      }
    })
  });

  const response = await workerRoute(request, {
    ENABLE_LINK_TRACKING: "true"
  });
  assert.equal(response.status, 200);
  const body = await response.json();

  const allButtons = [];
  for (const output of body.template.outputs) {
    if (output.textCard?.buttons) allButtons.push(...output.textCard.buttons);
    if (output.basicCard?.buttons) allButtons.push(...output.basicCard.buttons);
  }

  const purchaseBtn = allButtons.find((b) => b.action === "webLink" && b.label === "실린더 구매");
  assert.ok(purchaseBtn, "Expected to find cylinder purchase button");
  assert.ok(purchaseBtn.webLinkUrl.includes("/track/click"), "URL should be wrapped with /track/click");
  assert.ok(purchaseBtn.webLinkUrl.includes("target="), "URL should include target");
  assert.ok(purchaseBtn.webLinkUrl.includes("brand=aarke"), "URL should include brand");
  assert.ok(purchaseBtn.webLinkUrl.includes("userId=aarke-tracker-user"), "URL should include userId");
});

test("records HANDOFF event type in history metadata when handoff is triggered", () => {
  const brand = getBrandConfig("laurastar");
  const handoffMatch = findBestFaq(brand.data, "상담원 연결");
  const entry = createFaqHistoryEntry({
    brand,
    method: "POST",
    path: "/skill/laurastar/faq",
    source: "kakao_skill",
    query: "상담원 연결",
    payload: { userRequest: { user: { id: "handoff-user" } } },
    match: handoffMatch
  });

  assert.equal(entry.metadata.eventType, "HANDOFF");
  assert.equal(entry.metadata.isHandoff, true);
});


