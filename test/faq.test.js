import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { findBestFaq, jsonWithFlatFaqs, searchFaq } from "../src/faq.js";
import { basicCard, basicCardCarousel, extractUtterance } from "../src/kakao.js";
import { buildSkillFaqResponse } from "../src/skill-response.js";
import { route as serverRoute } from "../src/server.js";

const data = jsonWithFlatFaqs(
  JSON.parse(fs.readFileSync(new URL("../data/laurastar-faq.json", import.meta.url), "utf8"))
);

test("loads categorized FAQ data", () => {
  assert.equal(data.categories.length, 10);
  assert.equal(data.flatFaqs.length, 54);
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
  assert.ok(body.template.outputs[0].basicCard);
  assert.equal(body.template.outputs[0].basicCard.title, "어떤 물을 사용해야 하나요?");
});

test("matches AS period questions", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  assert.ok(match);
  assert.equal(match.faq.id, "as-pickup-time");
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

  assert.equal(response.version, "2.0");
  assert.equal(response.template.outputs[0].basicCard.title.includes("IGGI"), true);
  assert.equal(
    response.template.outputs[0].basicCard.description.includes("문의하신 내용은"),
    false
  );
  assert.equal(response.template.outputs[0].basicCard.description.includes("검색 확신도"), false);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
  assert.equal(
    response.template.outputs
      .flatMap((output) => output.basicCard?.buttons || [])
      .some((button) => button.label === "AS 접수"),
    false
  );
  assert.ok(response.template.quickReplies.length <= 3);
});

test("hands off scenario categories to existing Kakao blocks", () => {
  const response = buildSkillFaqResponse(data, "AS/수리 질문 보기", null, "https://example.com");

  assert.equal(response.version, "2.0");
  assert.equal(response.template.outputs[0].basicCard.description.includes("전용 상담 메뉴"), true);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
  assert.ok(
    response.template.quickReplies.some((reply) =>
      reply.messageText === "AS/수리 문의"
    )
  );
});

test("hands off AS matches instead of answering in FAQ skill", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  const response = buildSkillFaqResponse(data, "AS 접수 얼마나 걸려", match, "https://example.com");

  assert.equal(response.template.outputs[0].basicCard.description.includes("전용 상담 메뉴"), true);
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
});

test("adds Laurastar thumbnail to fallback responses", () => {
  const response = buildSkillFaqResponse(data, "모르는 질문", null, "https://example.com");

  assert.ok(response.template.outputs[0].basicCard.description.includes("자주 묻는 질문입니다."));
  assert.ok(response.template.outputs.some((output) => output.basicCard?.thumbnail?.imageUrl));
});

test("shows frequent FAQ list for broad or unknown questions", () => {
  const response = buildSkillFaqResponse(data, "자주 묻는 질문", null, "https://example.com");
  const text = response.template.outputs[0].basicCard.description;

  assert.equal(text.includes("자주 묻는 질문입니다."), true);
  assert.equal(text.includes("1. 어떤 물을 사용해야 하나요?"), true);
  assert.equal(text.includes("8. 다리미판 커버 호환은 어떻게 되나요?"), true);
  assert.ok(response.template.quickReplies.length >= 8);
});
