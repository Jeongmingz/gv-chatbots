import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_PATH = path.join(__dirname, "..", "public", "assets", "laurastar-chatbot-intro.png");
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

function sendPng(res, filePath) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": "image/png",
    "content-length": body.length,
    "cache-control": "public, max-age=31536000, immutable"
  });
  res.end(body);
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

async function handleSkillFaq(req, res, origin, brand, url) {
  const payload = await readJson(req);
  const utterance = extractUtterance(payload);
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

  sendJson(res, 200, buildSkillFaqResponse(brand.data, utterance, match, origin, brand));
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

    sendJson(res, 200, buildSkillFaqResponse(brand.data, utterance, match, url.origin, brand));
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
        brands: getAllBrandSummaries()
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/assets/laurastar-chatbot-intro.png") {
      sendPng(res, ASSET_PATH);
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

    if (req.method === "POST" && url.pathname === "/skill/laurastar/faq") {
      await handleSkillFaq(req, res, url.origin, getBrandConfig("laurastar"), url);
      return;
    }

    if (req.method === "POST" && url.pathname === "/skill/woods/faq") {
      await handleSkillFaq(req, res, url.origin, getBrandConfig("woods"), url);
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
