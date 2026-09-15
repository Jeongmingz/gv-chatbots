import { normalizeText } from "./faq.js";
import { normalizeQueryTypos } from "./typo-normalizer.js";
import { inferSupportMenuId } from "./support-menu.js";
export {
  inferTargetType,
  buildTrackedUrl,
  createClickHistoryEntry,
  createActionHistoryEntry
} from "./analytics.js";

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

export function extractUserId(payload) {
  return (
    payload?.userRequest?.user?.id ||
    payload?.userRequest?.user?.properties?.botUserKey ||
    payload?.userRequest?.user?.properties?.plusfriendUserKey ||
    null
  );
}

export function extractIsFriend(payload) {
  const isFriend = payload?.userRequest?.user?.properties?.isFriend;
  if (typeof isFriend === "boolean") return isFriend;
  if (isFriend === "true") return true;
  if (isFriend === "false") return false;
  return null;
}

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

export function formatKoreaTimestamp(date = new Date()) {
  const koreaDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  return [
    koreaDate.getUTCFullYear(),
    pad(koreaDate.getUTCMonth() + 1),
    pad(koreaDate.getUTCDate())
  ].join("-") + "T" + [
    pad(koreaDate.getUTCHours()),
    pad(koreaDate.getUTCMinutes()),
    pad(koreaDate.getUTCSeconds())
  ].join(":") + `.${pad(koreaDate.getUTCMilliseconds(), 3)}`;
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
  const typoNormalization = normalizeQueryTypos(trimmedQuery);
  const menuId = payload?.action?.clientExtra?.supportMenuId || inferSupportMenuId(trimmedQuery);
  const productFamilyId = payload?.action?.clientExtra?.productFamilyId || null;
  const confidence = !faq ? "unmatched" : match.score >= 100 ? "high" : match.score >= 60 ? "medium" : "low";

  const compactQuery = compact(trimmedQuery);
  const isHandoff =
    faq?.id === "base-human-handoff" ||
    compactQuery.includes("상담원연결") ||
    compactQuery.includes("상담사연결") ||
    compactQuery.includes("상담직원");
  const eventType = isHandoff ? "HANDOFF" : faq ? "FAQ_MATCH" : "UNMATCHED";

  return {
    timestamp: formatKoreaTimestamp(),
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
      lang: payload?.userRequest?.lang || null,
      isFriend: extractIsFriend(payload),
      menuId,
      productFamilyId,
      confidence,
      result: faq ? "matched" : "unmatched",
      ...(isHandoff ? { eventType: "HANDOFF", isHandoff: true } : {}),
      ...(typoNormalization.changed
        ? {
            queryCorrected: typoNormalization.normalized,
            typoCorrections: typoNormalization.corrections
          }
        : {})
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

export function getSupabaseHistoryConfigStatus(config = {}) {
  const missingSecrets = [];

  if (!config.url) missingSecrets.push("SUPABASE_URL");
  if (!config.serviceRoleKey) missingSecrets.push("SUPABASE_SERVICE_ROLE_KEY");

  return {
    configured: missingSecrets.length === 0,
    missingSecrets
  };
}

export async function writeSupabaseHistory(entry, config = {}) {
  if (!hasSupabaseHistoryConfig(config)) return false;

  const isActionEvent = entry?.source === "link_click" || entry?.source === "action_event";
  const table = (isActionEvent && config.actionTable) || config.table || "faq_history";
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
