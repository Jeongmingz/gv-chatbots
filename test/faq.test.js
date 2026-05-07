import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findBestFaq, jsonWithFlatFaqs, searchFaq } from "../src/faq.js";
import { extractUtterance } from "../src/kakao.js";
import { buildSkillFaqResponse } from "../src/skill-response.js";

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

test("returns ranked search results", () => {
  const results = searchFaq(data, "리프트 필터 교체 주기", { limit: 3 });
  assert.ok(results.length > 0);
  assert.equal(results[0].faq.id, "izzi-lift-filter-replacement");
});

test("matches AS period questions", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  assert.ok(match);
  assert.equal(match.faq.id, "as-pickup-time");
});

test("builds official Kakao skill response for matched FAQ", () => {
  const match = findBestFaq(data, "IGGI 마개가 안 열려요");
  const response = buildSkillFaqResponse(data, "IGGI 마개가 안 열려요", match);

  assert.equal(response.version, "2.0");
  assert.equal(response.template.outputs[0].simpleText.text.includes("IGGI"), true);
  assert.equal(response.template.outputs[0].simpleText.text.includes("검색 확신도"), false);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.equal(
    response.template.outputs
      .flatMap((output) => output.basicCard?.buttons || [])
      .some((button) => button.label === "AS 접수"),
    false
  );
  assert.ok(response.template.quickReplies.length <= 3);
});

test("hands off scenario categories to existing Kakao blocks", () => {
  const response = buildSkillFaqResponse(data, "AS/수리 질문 보기", null);

  assert.equal(response.version, "2.0");
  assert.equal(response.template.outputs[0].simpleText.text.includes("전용 상담 메뉴"), true);
  assert.equal(response.template.outputs.some((output) => output.carousel), false);
  assert.ok(
    response.template.quickReplies.some((reply) =>
      reply.messageText === "AS/수리 문의"
    )
  );
});

test("hands off AS matches instead of answering in FAQ skill", () => {
  const match = findBestFaq(data, "AS 접수 얼마나 걸려");
  const response = buildSkillFaqResponse(data, "AS 접수 얼마나 걸려", match);

  assert.equal(response.template.outputs[0].simpleText.text.includes("전용 상담 메뉴"), true);
  assert.equal(response.template.outputs.some((output) => output.basicCard), false);
});
