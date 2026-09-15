import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearBrandSession,
  getBrandSession,
  saveBrandSession,
  wantsBrandChange
} from "./brand-session.js";
import {
  findBestFaq,
  getSuggestedFaqs,
  searchFaq
} from "./faq.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const HISTORY_PATH = path.join(__dirname, "..", "logs", "faq-history.ndjson");

const PORT = Number(process.env.PORT || 3000);

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "public, max-age=31536000, immutable"
  });
  res.end(body);
}

function sendPublicFile(res, pathname) {
  if (!/^\/(?:assets|faq_images)\/[\w./-]+\.(?:png|jpe?g)$/u.test(pathname)) {
    sendJson(res, 404, { error: "Not found" });
    return true;
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return true;
  }

  const contentType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
  sendFile(res, filePath, contentType);
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
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

async function appendLocalHistory(entry) {
  await fs.promises.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.promises.appendFile(HISTORY_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

async function recordHistory(entry) {
  const supabaseConfig = {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    table: process.env.SUPABASE_HISTORY_TABLE
  };

  if (hasSupabaseHistoryConfig(supabaseConfig)) {
    await writeSupabaseHistory(entry, supabaseConfig);
    return;
  }

  await writeHistoryEntry(entry, appendLocalHistory);
}

function getNodeHistoryStatus() {
  const configStatus = getSupabaseHistoryConfigStatus({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  });

  return {
    configured: configStatus.configured,
    sink: configStatus.configured ? "supabase" : "local_file",
    missingSecrets: configStatus.missingSecrets
  };
}

function getBrandSessionConfig() {
  return {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    table: process.env.SUPABASE_BRAND_SESSION_TABLE
  };
}

function getResponseConfig(brand, payload = {}) {
  return {
    ...brand,
    responseLayout: process.env.KAKAO_RESPONSE_LAYOUT || "legacy",
    isFriend: extractIsFriend(payload)
  };
}

async function handleSkillFaq(req, res, origin, brand, url) {
  const payload = await readJson(req);
  const utterance = extractUtterance(payload);
  const selectedProductFamily = extractProductFamilyFromPayload(payload, brand.key);
  const selectedSupportMenu = extractSupportMenuFromPayload(payload);
  const responseConfig = getResponseConfig(brand, payload);

  if (selectedProductFamily) {
    sendJson(res, 200, buildProductFamilyResponse(brand.data, selectedProductFamily));
    return;
  }
  if (selectedSupportMenu) {
    sendJson(
      res,
      200,
      buildSupportMenuResponse(brand.data, selectedSupportMenu, responseConfig)
    );
    return;
  }
  const match = findBestFaq(brand.data, utterance);

  await recordHistory(
    createFaqHistoryEntry({
      brand,
      method: req.method,
      path: url.pathname,
      source: "kakao_skill",
      query: utterance,
      payload,
      match
    })
  );

  sendJson(
    res,
    200,
    buildSkillFaqResponse(brand.data, utterance, match, origin, responseConfig)
  );
}

async function handleUnifiedSkillFaq(req, res, origin, url) {
  const payload = await readJson(req);
  const utterance = extractUtterance(payload);
  const userId = extractUserId(payload);
  const sessionConfig = getBrandSessionConfig();

  if (wantsBrandChange(utterance)) {
    await clearBrandSession(userId, sessionConfig);
    sendJson(res, 200, buildBrandSelectionResponse("", origin));
    return;
  }

  const selected = extractBrandSelection(utterance);
  const payloadBrand = extractBrandFromPayload(payload);
  const sessionBrandKey = payloadBrand || selected.brand ? null : await getBrandSession(userId, sessionConfig);
  const sessionBrand = sessionBrandKey ? resolveBrandConfig(sessionBrandKey) : null;
  const brand = payloadBrand || selected.brand || sessionBrand;
  const query = brand ? selected.query : utterance;

  if (!payloadBrand && !selected.brand && !sessionBrand) {
    sendJson(res, 200, buildBrandSelectionResponse(utterance, origin));
    return;
  }

  await saveBrandSession(userId, brand.key, sessionConfig);

  const brandResponseConfig = getResponseConfig(brand, payload);
  const selectedProductFamily = extractProductFamilyFromPayload(payload, brand.key);
  const selectedSupportMenu = extractSupportMenuFromPayload(payload);
  if (selectedProductFamily) {
    sendJson(
      res,
      200,
      withBrandChangeQuickReply(
        buildProductFamilyResponse(brand.data, selectedProductFamily)
      )
    );
    return;
  }
  if (selectedSupportMenu) {
    sendJson(
      res,
      200,
      withBrandChangeQuickReply(
        buildSupportMenuResponse(
          brand.data,
          selectedSupportMenu,
          { ...brandResponseConfig, baseUrl: origin }
        )
      )
    );
    return;
  }

  const match = findBestFaq(brand.data, query);

  await recordHistory(
    createFaqHistoryEntry({
      brand,
      method: req.method,
      path: url.pathname,
      source: "kakao_unified_skill",
      query,
      payload,
      match
    })
  );

  if ((payloadBrand || selected.brand) && !query) {
    sendJson(
      res,
      200,
      withBrandChangeQuickReply(
        buildBrandWelcomeResponse(brand.data, origin, brandResponseConfig),
        { primaryLimit: 1 }
      )
    );
    return;
  }

  sendJson(
    res,
    200,
    withBrandChangeQuickReply(
      buildSkillFaqResponse(brand.data, query, match, origin, brandResponseConfig)
    )
  );
}

async function handleSearch(req, res, url, brand) {
  const payload = req.method === "POST" ? await readJson(req) : {};
  if (req.method === "POST" && (payload.userRequest || payload.action)) {
    const utterance = extractUtterance(payload);
    const match = findBestFaq(brand.data, utterance);

    await recordHistory(
      createFaqHistoryEntry({
        brand,
        method: req.method,
        path: url.pathname,
        source: "kakao_search",
        query: utterance,
        payload,
        match
      })
    );

    sendJson(
      res,
      200,
      buildSkillFaqResponse(brand.data, utterance, match, url.origin, getResponseConfig(brand, payload))
    );
    return;
  }

  const query = extractSearchQuery(payload, url);
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
      method: req.method,
      path: url.pathname,
      source: "faq_search",
      query,
      payload,
      match: matches[0] || null
    })
  );

  sendJson(res, 200, { brand: brand.key, query, results });
}

function handleCategories(res, brand) {
  sendJson(res, 200, {
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

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const brand = getBrandFromUrl(url);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const defaultBrand = getBrandConfig(DEFAULT_BRAND_KEY);
      sendJson(res, 200, {
        ok: true,
        brand: defaultBrand.data.brand,
        categories: defaultBrand.data.categories.length,
        faqs: defaultBrand.data.flatFaqs.length,
        history: getNodeHistoryStatus(),
        brands: getAllBrandSummaries()
      });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/faq_images/"))
    ) {
      sendPublicFile(res, url.pathname);
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/faq/categories" || url.pathname === `/${brand.key}/faq/categories`)
    ) {
      handleCategories(res, brand);
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/faq/guide" || url.pathname === `/${brand.key}/faq/guide`)
    ) {
      sendJson(res, 200, buildGuideResponse(brand.data, url.origin, brand));
      return;
    }

    if (
      (req.method === "GET" || req.method === "POST") &&
      (url.pathname === "/faq/search" || url.pathname === `/${brand.key}/faq/search`)
    ) {
      await handleSearch(req, res, url, brand);
      return;
    }

    if (req.method === "POST" && url.pathname === "/skill/faq") {
      await handleUnifiedSkillFaq(req, res, url.origin, url);
      return;
    }

    const skillBrandMatch = url.pathname.match(/^\/skill\/([^/]+)\/faq$/u);
    if (req.method === "POST" && skillBrandMatch) {
      const skillBrand = resolveBrandConfig(skillBrandMatch[1]);
      if (!skillBrand) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      await handleSkillFaq(req, res, url.origin, skillBrand, url);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 400, {
      error: "Invalid request",
      message: error.message
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = http.createServer(route);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the existing process or run with PORT=3001 npm start.`
      );
      process.exit(1);
    }

    throw error;
  });

  server.listen(PORT, () => {
    console.log(`FAQ skill server listening on http://localhost:${PORT}`);
  });
}

export { route };
