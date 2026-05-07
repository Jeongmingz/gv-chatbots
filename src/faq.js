const fs = require("node:fs");
const path = require("node:path");

const FAQ_PATH = path.join(__dirname, "..", "data", "laurastar-faq.json");

function loadFaqData(filePath = FAQ_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  return jsonWithFlatFaqs(JSON.parse(raw));
}

function jsonWithFlatFaqs(data) {
  const flatFaqs = data.categories.flatMap((category) =>
    category.faqs.map((faq) => ({
      ...faq,
      categoryId: category.id,
      categoryName: category.name,
      categoryAliases: category.aliases || []
    }))
  );

  return {
    ...data,
    flatFaqs
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesCompact(source, target) {
  const sourceCompact = normalizeText(source).replace(/\s+/g, "");
  const targetCompact = normalizeText(target).replace(/\s+/g, "");
  return Boolean(targetCompact) && sourceCompact.includes(targetCompact);
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function scoreFaq(faq, query) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const question = normalizeText(faq.question);
  const answer = normalizeText(faq.answer);
  const keywords = faq.keywords || [];
  const aliases = faq.categoryAliases || [];

  let score = 0;

  if (question === normalizedQuery) score += 100;
  if (includesCompact(question, query)) score += 45;

  for (const keyword of keywords) {
    if (includesCompact(query, keyword)) score += 35;
    if (includesCompact(keyword, query)) score += 20;
  }

  for (const alias of aliases) {
    if (includesCompact(query, alias)) score += 12;
  }

  for (const token of queryTokens) {
    if (question.includes(token)) score += 6;
    if (answer.includes(token)) score += 2;
    for (const keyword of keywords) {
      if (normalizeText(keyword).includes(token)) score += 5;
    }
  }

  return score;
}

function searchFaq(data, query, options = {}) {
  const limit = options.limit || 5;
  const scored = data.flatFaqs
    .map((faq) => ({
      faq,
      score: scoreFaq(faq, query)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

function findBestFaq(data, query) {
  const [best] = searchFaq(data, query, { limit: 1 });
  if (!best || best.score < 12) return null;
  return best;
}

function getSuggestedFaqs(data, categoryId, limit = 5) {
  const candidates = categoryId
    ? data.flatFaqs.filter((faq) => faq.categoryId === categoryId)
    : data.flatFaqs;

  return candidates.slice(0, limit);
}

module.exports = {
  findBestFaq,
  getSuggestedFaqs,
  loadFaqData,
  normalizeText,
  searchFaq
};
