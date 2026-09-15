import {
  findBestFaq,
  getSuggestedFaqs,
  searchFaq
} from "./faq.js";
import {
  clearBrandSession,
  getBrandSession,
  saveBrandSession,
  wantsBrandChange
} from "./brand-session.js";
import {
  DEFAULT_BRAND_KEY,
  extractBrandFromPayload,
  extractBrandSelection,
  getAllBrandSummaries,
  getBrandConfig,
  getBrandFromUrl,
  resolveBrandConfig
} from "./brands.js";
import {
  createFaqHistoryEntry,
  extractIsFriend,
  extractUserId,
  getSupabaseHistoryConfigStatus,
  hasSupabaseHistoryConfig,
  writeHistoryEntry,
  writeSupabaseHistory
} from "./history.js";
import { extractUtterance } from "./kakao.js";
import {
  buildBrandWelcomeResponse,
  buildProductFamilyResponse,
  buildSupportMenuResponse,
  buildBrandSelectionResponse,
  buildGuideResponse,
  buildSkillFaqResponse,
  withBrandChangeQuickReply
} from "./skill-response.js";
import { extractProductFamilyFromPayload } from "./product-catalog.js";
import { extractSupportMenuFromPayload } from "./support-menu.js";

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
    console.log(
      "faq_history_saved",
      JSON.stringify({
        brand: entry.brand,
        source: entry.source,
        path: entry.path,
        matched: entry.matched,
        faqId: entry.faqId
      })
    );
    return;
  }

  console.warn(
    "faq_history_config_missing",
    JSON.stringify({
      ...getSupabaseHistoryConfigStatus(supabaseConfig),
      fallback: "console",
      brand: entry.brand,
      source: entry.source,
      path: entry.path
    })
  );
  console.log("faq_history", JSON.stringify(entry));
}

async function recordHistory(entry, env, ctx) {
  const write = () => writeHistoryEntry(entry, (historyEntry) => writeWorkerHistory(historyEntry, env));
  const writeWithErrorLog = () =>
    write().catch((error) => {
      console.error(
        "faq_history_write_failed",
        JSON.stringify({
          message: error.message,
          brand: entry.brand,
          source: entry.source,
          path: entry.path,
          matched: entry.matched,
          faqId: entry.faqId
        })
      );
      throw error;
    });

  if (ctx?.waitUntil) {
    ctx.waitUntil(writeWithErrorLog());
    return;
  }

  await writeWithErrorLog();
}

function getWorkerHistoryStatus(env = {}) {
  const configStatus = getSupabaseHistoryConfigStatus({
    url: env?.SUPABASE_URL,
    serviceRoleKey: env?.SUPABASE_SERVICE_ROLE_KEY
  });

  return {
    configured: configStatus.configured,
    sink: configStatus.configured ? "supabase" : "console",
    missingSecrets: configStatus.missingSecrets
  };
}

function getBrandSessionConfig(env = {}) {
  return {
    url: env?.SUPABASE_URL,
    serviceRoleKey: env?.SUPABASE_SERVICE_ROLE_KEY,
    table: env?.SUPABASE_BRAND_SESSION_TABLE,
    fetchImpl: env?.SUPABASE_FETCH || fetch
  };
}

function getResponseConfig(brand, env = {}, payload = {}) {
  return {
    ...brand,
    responseLayout: env.KAKAO_RESPONSE_LAYOUT || "legacy",
    isFriend: extractIsFriend(payload)
  };
}

async function handleSkillFaq(request, origin, brand, env, ctx) {
  const payload = await readJson(request);
  const url = new URL(request.url);
  const utterance = extractUtterance(payload);
  const selectedProductFamily = extractProductFamilyFromPayload(payload, brand.key);
  const selectedSupportMenu = extractSupportMenuFromPayload(payload);
  const responseConfig = getResponseConfig(brand, env, payload);

  if (selectedProductFamily) {
    return jsonResponse(buildProductFamilyResponse(brand.data, selectedProductFamily));
  }
  if (selectedSupportMenu) {
    return jsonResponse(
      buildSupportMenuResponse(brand.data, selectedSupportMenu, responseConfig)
    );
  }
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

  return jsonResponse(
    buildSkillFaqResponse(brand.data, utterance, match, origin, responseConfig)
  );
}

async function handleUnifiedSkillFaq(request, origin, env, ctx) {
  const payload = await readJson(request);
  const url = new URL(request.url);
  const utterance = extractUtterance(payload);
  const userId = extractUserId(payload);
  const sessionConfig = getBrandSessionConfig(env);

  if (wantsBrandChange(utterance)) {
    await clearBrandSession(userId, sessionConfig);
    return jsonResponse(buildBrandSelectionResponse("", origin));
  }

  const selected = extractBrandSelection(utterance);
  const payloadBrand = extractBrandFromPayload(payload);
  const sessionBrandKey = payloadBrand || selected.brand ? null : await getBrandSession(userId, sessionConfig);
  const sessionBrand = sessionBrandKey ? resolveBrandConfig(sessionBrandKey) : null;
  const brand = payloadBrand || selected.brand || sessionBrand;
  const query = brand ? selected.query : utterance;

  if (!payloadBrand && !selected.brand && !sessionBrand) {
    return jsonResponse(buildBrandSelectionResponse(utterance, origin));
  }

  await saveBrandSession(userId, brand.key, sessionConfig);

  const brandResponseConfig = getResponseConfig(brand, env, payload);
  const selectedProductFamily = extractProductFamilyFromPayload(payload, brand.key);
  const selectedSupportMenu = extractSupportMenuFromPayload(payload);
  if (selectedProductFamily) {
    return jsonResponse(
      withBrandChangeQuickReply(
        buildProductFamilyResponse(brand.data, selectedProductFamily)
      )
    );
  }
  if (selectedSupportMenu) {
    return jsonResponse(
      withBrandChangeQuickReply(
        buildSupportMenuResponse(
          brand.data,
          selectedSupportMenu,
          { ...brandResponseConfig, baseUrl: origin }
        )
      )
    );
  }

  const match = findBestFaq(brand.data, query);

  await recordHistory(
    createFaqHistoryEntry({
      brand,
      method: request.method,
      path: url.pathname,
      source: "kakao_unified_skill",
      query,
      payload,
      match
    }),
    env,
    ctx
  );

  if ((payloadBrand || selected.brand) && !query) {
    return jsonResponse(
      withBrandChangeQuickReply(
        buildBrandWelcomeResponse(brand.data, origin, brandResponseConfig),
        { primaryLimit: 1 }
      )
    );
  }

  return jsonResponse(
    withBrandChangeQuickReply(
      buildSkillFaqResponse(brand.data, query, match, origin, brandResponseConfig)
    )
  );
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

    return jsonResponse(
      buildSkillFaqResponse(brand.data, utterance, match, url.origin, getResponseConfig(brand, env, payload))
    );
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
        history: getWorkerHistoryStatus(env),
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

    if (request.method === "POST" && url.pathname === "/skill/faq") {
      return handleUnifiedSkillFaq(request, url.origin, env, ctx);
    }

    const skillBrandMatch = url.pathname.match(/^\/skill\/([^/]+)\/faq$/u);
    if (request.method === "POST" && skillBrandMatch) {
      const skillBrand = resolveBrandConfig(skillBrandMatch[1]);
      return skillBrand
        ? handleSkillFaq(request, url.origin, skillBrand, env, ctx)
        : jsonResponse({ error: "Not found" }, 404);
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
