import { formatKoreaTimestamp } from "./history.js";

const memorySessions = new Map();
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
export const BRAND_CHANGE_UTTERANCE = "브랜드 변경";

function sessionRowToBrand(row) {
  if (!row?.brand) return null;

  if (row.expires_at && row.expires_at < formatKoreaTimestamp()) {
    return null;
  }

  return row.brand;
}

function endpoint(config = {}) {
  const table = config.table || "faq_brand_sessions";
  return `${config.url.replace(/\/$/u, "")}/rest/v1/${table}`;
}

function headers(config = {}, prefer) {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {})
  };
}

export function wantsBrandChange(utterance) {
  const normalized = String(utterance || "").replace(/\s+/g, "").trim();
  return normalized === BRAND_CHANGE_UTTERANCE.replace(/\s+/g, "");
}

export function hasBrandSessionConfig(config = {}) {
  return Boolean(config.url && config.serviceRoleKey);
}

export async function getBrandSession(userId, config = {}) {
  if (!userId) return null;

  if (!hasBrandSessionConfig(config)) {
    const row = memorySessions.get(userId);
    const brand = sessionRowToBrand(row);
    if (row && !brand) memorySessions.delete(userId);
    return brand;
  }

  const fetchImpl = config.fetchImpl || fetch;
  const url = `${endpoint(config)}?user_id=eq.${encodeURIComponent(userId)}&select=brand,expires_at&limit=1`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: headers(config)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase brand session read failed: ${response.status} ${detail}`.trim());
  }

  const [row] = await response.json();
  const brand = sessionRowToBrand(row);
  if (row && !brand) await clearBrandSession(userId, config);
  return brand;
}

export async function saveBrandSession(userId, brandKey, config = {}) {
  if (!userId || !brandKey) return false;

  const updatedAt = formatKoreaTimestamp();
  const expiresAt = formatKoreaTimestamp(new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000));
  const row = {
    user_id: userId,
    brand: brandKey,
    updated_at: updatedAt,
    expires_at: expiresAt
  };

  if (!hasBrandSessionConfig(config)) {
    memorySessions.set(userId, row);
    return true;
  }

  const fetchImpl = config.fetchImpl || fetch;
  const response = await fetchImpl(`${endpoint(config)}?on_conflict=user_id`, {
    method: "POST",
    headers: headers(config, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase brand session save failed: ${response.status} ${detail}`.trim());
  }

  return true;
}

export async function clearBrandSession(userId, config = {}) {
  if (!userId) return false;

  if (!hasBrandSessionConfig(config)) {
    return memorySessions.delete(userId);
  }

  const fetchImpl = config.fetchImpl || fetch;
  const url = `${endpoint(config)}?user_id=eq.${encodeURIComponent(userId)}`;
  const response = await fetchImpl(url, {
    method: "DELETE",
    headers: headers(config, "return=minimal")
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase brand session clear failed: ${response.status} ${detail}`.trim());
  }

  return true;
}
