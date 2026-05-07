const test = require("node:test");
const assert = require("node:assert/strict");
const { findBestFaq, loadFaqData, searchFaq } = require("../src/faq");

const data = loadFaqData();

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
