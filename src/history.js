import { normalizeText } from "./faq.js";

function compact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function findSelectedModel(faq, query) {
  const models = faq?.available_models || Object.keys(faq?.model_answers || {});
  const queryText = compact(query);

  return (
    models.find((model) => {
      const modelText = compact(model);
      const withoutPro = modelText.endsWith("pro") ? modelText.replace(/pro$/u, "") : modelText;
      return queryText.includes(modelText) || queryText.includes(withoutPro);
    }) || null
  );
}

function extractUserId(payload) {
  return (
    payload?.userRequest?.user?.id ||
    payload?.userRequest?.user?.properties?.botUserKey ||
    payload?.userRequest?.user?.properties?.plusfriendUserKey ||
    null
  );
}

export function createFaqHistoryEntry({
  brand,
  method,
  path,
  source,
  query,
  payload,
  match
}) {
  const faq = match?.faq || null;
  const trimmedQuery = String(query || "").trim();

  return {
    timestamp: new Date().toISOString(),
    brand: brand.key,
    brandName: brand.data.brand,
    method,
    path,
    source,
    userId: extractUserId(payload),
    query: trimmedQuery,
    queryNormalized: normalizeText(trimmedQuery),
    queryLength: trimmedQuery.length,
    matched: Boolean(faq),
    score: match?.score || 0,
    faqId: faq?.id || null,
    faqQuestion: faq?.question || null,
    categoryId: faq?.categoryId || null,
    categoryName: faq?.categoryName || null,
    answerType: faq?.answer_type || "common",
    selectedModel: findSelectedModel(faq, query),
    metadata: {
      kakaoUserType: payload?.userRequest?.user?.type || null,
      timezone: payload?.userRequest?.timezone || null,
      lang: payload?.userRequest?.lang || null
    }
  };
}

export async function writeHistoryEntry(entry, sink) {
  if (!sink) return;
  await sink(entry);
}

export function historyEntryToSupabaseRow(entry) {
  return {
    occurred_at: entry.timestamp,
    brand: entry.brand,
    brand_name: entry.brandName,
    method: entry.method,
    path: entry.path,
    source: entry.source,
    user_id: entry.userId,
    query: entry.query,
    query_normalized: entry.queryNormalized,
    query_length: entry.queryLength,
    matched: entry.matched,
    score: entry.score,
    faq_id: entry.faqId,
    faq_question: entry.faqQuestion,
    category_id: entry.categoryId,
    category_name: entry.categoryName,
    answer_type: entry.answerType,
    selected_model: entry.selectedModel,
    metadata: entry.metadata
  };
}

export function hasSupabaseHistoryConfig(config = {}) {
  return Boolean(config.url && config.serviceRoleKey);
}

export async function writeSupabaseHistory(entry, config = {}) {
  if (!hasSupabaseHistoryConfig(config)) return false;

  const table = config.table || "faq_history";
  const fetchImpl = config.fetchImpl || fetch;
  const endpoint = `${config.url.replace(/\/$/u, "")}/rest/v1/${table}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify(historyEntryToSupabaseRow(entry))
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase history insert failed: ${response.status} ${detail}`.trim());
  }

  return true;
}
