import rawFaqData from "../data/laurastar-faq.json";
import {
  findBestFaq,
  getSuggestedFaqs,
  jsonWithFlatFaqs,
  searchFaq
} from "./faq.js";
import { extractUtterance } from "./kakao.js";
import { buildGuideResponse, buildSkillFaqResponse } from "./skill-response.js";

const faqData = jsonWithFlatFaqs(rawFaqData);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function handleSkillFaq(request, origin) {
  const payload = await readJson(request);
  const utterance = extractUtterance(payload);
  const match = findBestFaq(faqData, utterance);

  return jsonResponse(buildSkillFaqResponse(faqData, utterance, match, origin));
}

function handleSearch(url) {
  const query = url.searchParams.get("q") || "";
  const results = searchFaq(faqData, query, { limit: 10 }).map((item) => ({
    score: item.score,
    id: item.faq.id,
    categoryId: item.faq.categoryId,
    categoryName: item.faq.categoryName,
    question: item.faq.question,
    answer: item.faq.answer,
    links: item.faq.links || []
  }));

  return jsonResponse({ query, results });
}

function handleCategories() {
  return jsonResponse({
    categories: faqData.categories.map((category) => ({
      id: category.id,
      name: category.name,
      aliases: category.aliases,
      count: category.faqs.length,
      suggestions: getSuggestedFaqs(faqData, category.id, 3).map((faq) => ({
        id: faq.id,
        question: faq.question
      }))
    }))
  });
}

async function route(request) {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        runtime: "cloudflare-workers",
        brand: faqData.brand,
        categories: faqData.categories.length,
        faqs: faqData.flatFaqs.length
      });
    }

    if (request.method === "GET" && url.pathname === "/faq/categories") {
      return handleCategories();
    }

    if (request.method === "GET" && url.pathname === "/faq/guide") {
      return jsonResponse(buildGuideResponse(faqData, url.origin));
    }

    if (request.method === "GET" && url.pathname === "/faq/search") {
      return handleSearch(url);
    }

    if (request.method === "POST" && url.pathname === "/skill/laurastar/faq") {
      return handleSkillFaq(request, url.origin);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    return jsonResponse(
      {
        error: "Invalid request",
        message: error.message
      },
      400
    );
  }
}

export default {
  fetch: route
};

export { route };
