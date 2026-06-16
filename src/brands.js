import rawLaurastarFaqData from "../data/laurastar-faq.json" with { type: "json" };
import rawWoodsFaqData from "../data/woods-faq.json" with { type: "json" };
import rawAarkeFaqData from "../data/aarke-faq.json" with { type: "json" };
import { jsonWithFlatFaqs } from "./faq.js";
import { webLinkButton } from "./kakao.js";

const laurastar = jsonWithFlatFaqs(rawLaurastarFaqData);
const woods = jsonWithFlatFaqs(rawWoodsFaqData);
const aarke = jsonWithFlatFaqs(rawAarkeFaqData);

const brandConfigs = {
  laurastar: {
    key: "laurastar",
    selectionLabel: "로라스타",
    data: laurastar,
    thumbnailPath: "/assets/laurastar-chatbot-intro.png",
    guideTitle: "로라스타 주요 바로가기",
    guideLines: [
      "자주 찾는 공식 안내 메뉴입니다.",
      "궁금한 내용을 질문으로 입력해 주세요.",
      "아래 빠른 메뉴로도 안내받을 수 있습니다."
    ],
    guideButtons: [
      webLinkButton("매뉴얼", "https://www.laurastar.co.kr/front/board/manual"),
      webLinkButton("정품등록", "https://laurastar.co.kr/front/serialregist")
    ],
    frequentFaqIds: [
      "common-water-type",
      "common-manual-video",
      "common-product-registration",
      "smart-model-differences",
      "smart-vs-go-plus",
      "izzi-lift-filter-replacement",
      "iggi-cap-stuck",
      "board-cover-compatibility"
    ],
    actionQuickReplies: [
      ["AS 신청", "AS 접수"],
      ["사용 설명서"],
      ["상담원 연결"]
    ]
  },
  woods: {
    key: "woods",
    selectionLabel: "우즈",
    data: woods,
    thumbnailPath: "/assets/Woods_Chatbot_Intro.png",
    guideTitle: "우즈 주요 안내",
    guideLines: [
      "우즈 제품 사용, AS, 필터, 배수 관련 자주 찾는 안내입니다.",
      "궁금한 내용을 질문으로 입력해 주세요.",
      "모델별 안내가 필요한 경우 모델명을 함께 입력해 주세요."
    ],
    guideButtons: [
      webLinkButton("고객센터", "https://www.gatevision.co.kr/front/customerservice"),
      webLinkButton("제품등록", "https://woods.co.kr/front/registuser")
    ],
    frequentFaqIds: [
      "woods-작동이-안돼요",
      "woods-소음이-커요",
      "woods-저온제습기란-무엇인가요",
      "woods-AS접수는-어디에서-하나요",
      "woods-연속-배수-가능한가요",
      "woods-필터는-어디에서-구매하나요",
      "woods-필터-관리는-어떻게-하나요",
      "woods-몇평까지-커버할수-있나요"
    ],
    actionQuickReplies: [
      ["AS 접수", "AS접수는 어디에서 하나요?"],
      ["필터 구매", "필터는 어디에서 구매하나요?"],
      ["상담원 연결"]
    ]
  },
  aarke: {
    key: "aarke",
    selectionLabel: "아르케",
    data: aarke,
    thumbnailPath: "/assets/Gatevision_Chatbot_Intro.png",
    guideTitle: "아르케 주요 안내",
    guideLines: [
      "아르케 탄산수 제조기 사용, 병 세척, 실린더, AS 관련 자주 찾는 안내입니다.",
      "궁금한 내용을 질문으로 입력해 주세요.",
      "탄산 주입이나 실린더 문의는 증상을 함께 입력하면 더 정확히 안내받을 수 있습니다."
    ],
    guideButtons: [
      webLinkButton("사용 가이드", "https://www.aarke.co.kr/guide"),
      webLinkButton("제품등록", "https://aarke.co.kr/account?location=serialRegist"),
      webLinkButton("실린더 구매", "https://gvcurate.com/product/detail.html?product_no=764")
    ],
    frequentFaqIds: [
      "aarke-how-to-use",
      "aarke-weak-carbonation",
      "aarke-pet-bottle-cleaning",
      "aarke-pet-bottle-dishwasher",
      "aarke-third-party-cylinder",
      "aarke-refill-cylinder-purchase",
      "aarke-product-registration",
      "aarke-carbonator3-vs-pro"
    ],
    actionQuickReplies: [
      ["AS 접수", "AS 접수"],
      ["실린더 구매", "충전 실린더 구매 방법"],
      ["제품등록", "제품등록은 어디서 하나요?"],
      ["상담원 연결"]
    ]
  }
};

const aliases = new Map([
  ["laurastar", "laurastar"],
  ["laura", "laurastar"],
  ["로라스타", "laurastar"],
  ["woods", "woods"],
  ["wood", "woods"],
  ["우즈", "woods"],
  ["aarke", "aarke"],
  ["arke", "aarke"],
  ["아르케", "aarke"],
  ["아르케탄산수", "aarke"]
]);

export const DEFAULT_BRAND_KEY = "laurastar";

function normalizeBrandKey(brandKey) {
  return aliases.get(String(brandKey || "").toLowerCase()) || null;
}

export function resolveBrandConfig(brandKey) {
  const normalized = normalizeBrandKey(brandKey);
  return normalized ? brandConfigs[normalized] : null;
}

export function getBrandConfig(brandKey = DEFAULT_BRAND_KEY) {
  const normalized = normalizeBrandKey(brandKey) || DEFAULT_BRAND_KEY;
  return brandConfigs[normalized] || brandConfigs[DEFAULT_BRAND_KEY];
}

export function getBrandFromUrl(url) {
  const fromQuery = url.searchParams.get("brand");
  if (fromQuery) return getBrandConfig(fromQuery);

  const [firstSegment] = url.pathname.split("/").filter(Boolean);
  return getBrandConfig(firstSegment);
}

export function getAllBrandSummaries() {
  return Object.values(brandConfigs).map((brand) => ({
    key: brand.key,
    brand: brand.data.brand,
    categories: brand.data.categories.length,
    faqs: brand.data.flatFaqs.length
  }));
}

export function getBrandChoices() {
  return Object.values(brandConfigs).map((brand) => ({
    key: brand.key,
    label: brand.selectionLabel || brand.data.brand,
    brand: brand.data.brand
  }));
}

export function brandSelectionMessage(brandKey, query) {
  const trimmedQuery = String(query || "").trim();
  return trimmedQuery ? `[브랜드:${brandKey}] ${trimmedQuery}` : `[브랜드:${brandKey}]`;
}

export function extractBrandSelection(utterance) {
  const text = String(utterance || "").trim();
  const markerMatch = text.match(/^\[브랜드:([a-z0-9_-]+)\]\s*(.*)$/iu);

  if (markerMatch) {
    const brand = resolveBrandConfig(markerMatch[1]);
    return brand ? { brand, query: markerMatch[2].trim() } : { brand: null, query: text };
  }

  const compactText = text.replace(/\s+/g, "");
  for (const [alias, brandKey] of aliases) {
    const aliasCompact = alias.replace(/\s+/g, "");
    if (!aliasCompact || !compactText.startsWith(aliasCompact)) continue;

    const brand = brandConfigs[brandKey];
    const query = text.slice(alias.length).replace(/^[:：,\s-]+/u, "").trim();
    return { brand, query };
  }

  return { brand: null, query: text };
}

export function extractBrandFromPayload(payload) {
  return (
    resolveBrandConfig(payload?.action?.detailParams?.brand?.value) ||
    resolveBrandConfig(payload?.action?.detailParams?.brand?.origin) ||
    resolveBrandConfig(payload?.action?.params?.brand) ||
    resolveBrandConfig(payload?.brand) ||
    null
  );
}
