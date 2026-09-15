import { normalizeText } from "./faq.js";
import { formatKoreaTimestamp } from "./history.js";

const ASSET_FILE_REGEX = /\.(?:png|jpe?g|webp|gif|svg|ico)$/iu;

/**
 * URL과 버튼 라벨을 분석하여 대상 링크의 목적/성격을 자동 분류합니다.
 */
export function inferTargetType(url = "", label = "") {
  const lowerUrl = String(url || "").toLowerCase();
  const lowerLabel = String(label || "").toLowerCase();
  const combined = `${lowerUrl} ${lowerLabel}`;

  if (combined.includes("cswrite") || lowerLabel.includes("as") || lowerLabel.includes("a/s") || combined.includes("afterservice")) {
    return "AS_FORM";
  }
  if (lowerLabel.includes("등록") || combined.includes("regist") || combined.includes("serialregist")) {
    return "PRODUCT_REGISTRATION";
  }
  if (
    combined.includes("youtube.com") ||
    combined.includes("youtu.be") ||
    lowerLabel.includes("영상") ||
    lowerLabel.includes("동영상")
  ) {
    return "VIDEO_MANUAL";
  }
  if (
    lowerLabel.includes("설명서") ||
    lowerLabel.includes("매뉴얼") ||
    lowerLabel.includes("가이드") ||
    combined.includes("manual") ||
    combined.includes("/guide")
  ) {
    return "MANUAL";
  }
  if (
    lowerLabel.includes("구매") ||
    lowerLabel.includes("교환") ||
    combined.includes("product") ||
    combined.includes("smartstore") ||
    combined.includes("gvcurate") ||
    combined.includes("curationa") ||
    combined.includes("brand.naver.com")
  ) {
    return "PURCHASE";
  }
  if (lowerLabel.includes("고객센터") || combined.includes("customerservice")) {
    return "CUSTOMER_SERVICE";
  }
  if (lowerLabel.includes("매장") || combined.includes("storeinfo") || combined.includes("trialmember")) {
    return "STORE_LOCATION";
  }
  if (combined.includes("support")) {
    return "SUPPORT";
  }
  return "EXTERNAL";
}

/**
 * 버튼 링크를 클릭 트래킹 엔드포인트 URL로 감쌉니다.
 */
export function buildTrackedUrl(baseUrl, targetUrl, context = {}) {
  if (!baseUrl || !targetUrl) return targetUrl;

  const rawUrl = String(targetUrl).trim();
  if (!rawUrl) return rawUrl;

  // 이미지 등 정적 에셋 파일은 트래킹 리다이렉트 대상에서 제외
  if (ASSET_FILE_REGEX.test(rawUrl)) {
    return rawUrl;
  }

  const baseOrigin = baseUrl.replace(/\/+$/u, "");
  const trackingEndpoint = `${baseOrigin}/track/click`;

  // 이미 트래킹 URL로 감싸져 있는 경우 중복 래핑 방지
  if (rawUrl.startsWith(trackingEndpoint)) {
    return rawUrl;
  }

  const { brand, faqId, label, type, userId } = context;
  const inferredType = type || inferTargetType(rawUrl, label);

  const tracker = new URL(trackingEndpoint);
  tracker.searchParams.set("target", rawUrl);
  if (brand) tracker.searchParams.set("brand", brand);
  if (faqId) tracker.searchParams.set("faqId", faqId);
  if (label) tracker.searchParams.set("label", label);
  if (inferredType) tracker.searchParams.set("type", inferredType);
  if (userId) tracker.searchParams.set("userId", userId);

  return tracker.toString();
}

/**
 * 링크 클릭 이벤트를 Supabase history 스키마와 호환되는 엔트리로 변환합니다.
 */
export function createClickHistoryEntry({
  brandKey,
  brandName,
  targetUrl,
  targetType,
  label,
  faqId,
  userId,
  ip,
  userAgent
}) {
  const queryText = label || targetUrl || "링크 이동";
  const finalType = targetType || inferTargetType(targetUrl, label);

  return {
    timestamp: formatKoreaTimestamp(),
    brand: brandKey || "unknown",
    brandName: brandName || brandKey || "알 수 없음",
    method: "GET",
    path: "/track/click",
    source: "link_click",
    userId: userId || null,
    query: queryText,
    queryNormalized: normalizeText(queryText),
    queryLength: queryText.length,
    matched: true,
    score: 100,
    faqId: faqId || null,
    faqQuestion: label || null,
    categoryId: "link_click",
    categoryName: "링크 클릭",
    answerType: "link",
    selectedModel: null,
    metadata: {
      eventType: "LINK_CLICK",
      targetUrl,
      targetType: finalType,
      label: label || null,
      faqId: faqId || null,
      userId: userId || null,
      ip: ip || null,
      userAgent: userAgent || null
    }
  };
}

/**
 * 일반 행동 이벤트(상담원 연결 클릭, 퀵리플라이 선택 등)를 기록하기 위한 엔트리를 생성합니다.
 */
export function createActionHistoryEntry({
  eventType,
  brandKey,
  brandName,
  userId,
  actionLabel,
  faqId,
  metadata = {}
}) {
  const queryText = actionLabel || eventType;

  return {
    timestamp: formatKoreaTimestamp(),
    brand: brandKey || "unknown",
    brandName: brandName || brandKey || "알 수 없음",
    method: "POST",
    path: "/track/event",
    source: "action_event",
    userId: userId || null,
    query: queryText,
    queryNormalized: normalizeText(queryText),
    queryLength: queryText.length,
    matched: true,
    score: 100,
    faqId: faqId || null,
    faqQuestion: actionLabel || null,
    categoryId: "action_event",
    categoryName: "행동 이벤트",
    answerType: "event",
    selectedModel: null,
    metadata: {
      eventType: eventType || "ACTION_EVENT",
      actionLabel: actionLabel || null,
      faqId: faqId || null,
      userId: userId || null,
      ...metadata
    }
  };
}
