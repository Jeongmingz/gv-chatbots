export const SUPPORT_MENUS = [
  {
    id: "product",
    name: "제품관련 문의",
    description: "사용법 · 오류 · 관리"
  },
  {
    id: "exchange-refund",
    name: "교환/환불 문의",
    description: "교환 · 반품 · 환불"
  },
  {
    id: "as",
    name: "AS 문의",
    description: "고장 · 수리 · 보증"
  },
  {
    id: "purchase",
    name: "구매 문의",
    description: "제품 · 소모품 · 매장"
  },
  {
    id: "other",
    name: "기타",
    description: "제품등록 · 배송 · 기타 문의"
  }
];

const MENU_PATTERNS = {
  "exchange-refund": /교환|환불|반품|변심/u,
  as: /(?:^|[^a-z])a\s*\/?\s*s(?:[^a-z]|$)|수리|불량|고장|보증|검수|회수|누전|화재/u,
  purchase: /구매|구입|판매|매장|백화점|팝업|가격|쿠폰/u,
  other: /등록|설명서|매뉴얼|영상|배송|전자파|정전기|전선길이|제조시기/u
};

export function inferSupportMenuId(value) {
  const text = String(value || "").toLowerCase();
  const matched = Object.entries(MENU_PATTERNS)
    .find(([, pattern]) => pattern.test(text));
  return matched?.[0] || "product";
}

export function getSupportMenu(menuId) {
  if (menuId === "main") return { id: "main", name: "메인 메뉴" };
  return SUPPORT_MENUS.find((menu) => menu.id === menuId) || null;
}

export function extractSupportMenuFromPayload(payload) {
  return getSupportMenu(payload?.action?.clientExtra?.supportMenuId);
}

export function getSupportMenuFaqs(data, menuId, limit = 5) {
  const pattern = MENU_PATTERNS[menuId];
  if (!pattern) return [];

  return data.flatFaqs
    .filter((faq) => pattern.test(`${faq.question} ${faq.categoryName || ""}`.toLowerCase()))
    .slice(0, limit);
}
