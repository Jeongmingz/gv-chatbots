import {
  findBestFaq,
  getSuggestedFaqs,
  searchFaq
} from "./faq.js";
import { DEFAULT_BRAND_KEY, getAllBrandSummaries, getBrandConfig, getBrandFromUrl } from "./brands.js";
import {
  createFaqHistoryEntry,
  hasSupabaseHistoryConfig,
  writeHistoryEntry,
  writeSupabaseHistory
} from "./history.js";
import { extractUtterance } from "./kakao.js";
import { buildGuideResponse, buildSkillFaqResponse } from "./skill-response.js";

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

function extractSearchQuery(payload, url) {
  return (
    url?.searchParams.get("q") ||
    payload?.q ||
    payload?.query ||
    payload?.utterance ||
    payload?.userRequest?.utterance ||
    ""
  );
}

async function writeWorkerHistory(entry, env) {
  const supabaseConfig = {
    url: env?.SUPABASE_URL,
    serviceRoleKey: env?.SUPABASE_SERVICE_ROLE_KEY,
    table: env?.SUPABASE_HISTORY_TABLE,
    fetchImpl: env?.SUPABASE_FETCH || fetch
  };

  if (hasSupabaseHistoryConfig(supabaseConfig)) {
    await writeSupabaseHistory(entry, supabaseConfig);
    return;
  }

  console.log("faq_history", JSON.stringify(entry));
}

async function recordHistory(entry, env, ctx) {
  const write = () => writeHistoryEntry(entry, (historyEntry) => writeWorkerHistory(historyEntry, env));

  if (ctx?.waitUntil) {
    ctx.waitUntil(write());
    return;
  }

  await write();
}

async function handleSkillFaq(request, origin, brand, env, ctx) {
  const payload = await readJson(request);
  const url = new URL(request.url);
  const utterance = extractUtterance(payload);
  const match = findBestFaq(brand.data, utterance);

  await recordHistory(
    createFaqHistoryEntry({
      brand,
      method: request.method,
      path: url.pathname,
      source: "kakao_skill",
      query: utterance,
      payload,
      match
    }),
    env,
    ctx
  );

  return jsonResponse(buildSkillFaqResponse(brand.data, utterance, match, origin, brand));
}

async function handleSearchRequest(request, brand, env, ctx) {
  const payload = request.method === "POST" ? await readJson(request) : {};
  const url = new URL(request.url);
  const query = extractSearchQuery(payload, url);

  if (request.method === "POST" && (payload.userRequest || payload.action)) {
    const utterance = extractUtterance(payload);
    const match = findBestFaq(brand.data, utterance);

    await recordHistory(
      createFaqHistoryEntry({
        brand,
        method: request.method,
        path: url.pathname,
        source: "kakao_search",
        query: utterance,
        payload,
        match
      }),
      env,
      ctx
    );

    return jsonResponse(buildSkillFaqResponse(brand.data, utterance, match, url.origin, brand));
  }

  const matches = searchFaq(brand.data, query, { limit: 10 });
  const results = matches.map((item) => ({
    score: item.score,
    id: item.faq.id,
    categoryId: item.faq.categoryId,
    categoryName: item.faq.categoryName,
    question: item.faq.question,
    answer: item.faq.answer || item.faq.model_selection_prompt || "",
    answerType: item.faq.answer_type || "common",
    availableModels: item.faq.available_models || [],
    links: item.faq.links || []
  }));

  await recordHistory(
    createFaqHistoryEntry({
      brand,
      method: request.method,
      path: url.pathname,
      source: "faq_search",
      query,
      payload,
      match: matches[0] || null
    }),
    env,
    ctx
  );

  return jsonResponse({ brand: brand.key, query, results });
}

function handleCategories(brand) {
  return jsonResponse({
    brand: brand.key,
    categories: brand.data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      aliases: category.aliases,
      count: category.faqs.length,
      suggestions: getSuggestedFaqs(brand.data, category.id, 3).map((faq) => ({
        id: faq.id,
        question: faq.question
      }))
    }))
  });
}

async function route(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const brand = getBrandFromUrl(url);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      const defaultBrand = getBrandConfig(DEFAULT_BRAND_KEY);
      return jsonResponse({
        ok: true,
        runtime: "cloudflare-workers",
        brand: defaultBrand.data.brand,
        categories: defaultBrand.data.categories.length,
        faqs: defaultBrand.data.flatFaqs.length,
        brands: getAllBrandSummaries()
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/faq/categories" || url.pathname === `/${brand.key}/faq/categories`)
    ) {
      return handleCategories(brand);
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/faq/guide" || url.pathname === `/${brand.key}/faq/guide`)
    ) {
      return jsonResponse(buildGuideResponse(brand.data, url.origin, brand));
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      (url.pathname === "/faq/search" || url.pathname === `/${brand.key}/faq/search`)
    ) {
      return handleSearchRequest(request, brand, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/skill/laurastar/faq") {
      return handleSkillFaq(request, url.origin, getBrandConfig("laurastar"), env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/skill/woods/faq") {
      return handleSkillFaq(request, url.origin, getBrandConfig("woods"), env, ctx);
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
