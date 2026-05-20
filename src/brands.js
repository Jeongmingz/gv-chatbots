import rawLaurastarFaqData from "../data/laurastar-faq.json" with { type: "json" };
import rawWoodsFaqData from "../data/woods-faq.json" with { type: "json" };
import { jsonWithFlatFaqs } from "./faq.js";
import { webLinkButton } from "./kakao.js";

const laurastar = jsonWithFlatFaqs(rawLaurastarFaqData);
const woods = jsonWithFlatFaqs(rawWoodsFaqData);

const brandConfigs = {
  laurastar: {
    key: "laurastar",
    data: laurastar,
    thumbnailPath: "/assets/laurastar-chatbot-intro.png",
    supportFooter: "추가 확인이 필요한 경우 로라스타 공식 상담 메뉴를 이용해 주세요.",
    guideTitle: "로라스타 주요 바로가기",
    guideLines: [
      "자주 찾는 공식 안내 메뉴입니다.",
      "궁금한 내용을 질문으로 입력해 주세요.",
      "아래 빠른 메뉴로도 안내받을 수 있습니다."
    ],
    guideButtons: [
      webLinkButton("매뉴얼", "https://www.laurastar.co.kr/front/board/manual"),
      webLinkButton("정품등록", "https://www.laurastar.co.kr/front/login?param=serialregist")
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
    data: woods,
    thumbnailPath: null,
    supportFooter: "추가 확인이 필요한 경우 우즈 공식 상담 메뉴를 이용해 주세요.",
    guideTitle: "우즈 주요 안내",
    guideLines: [
      "우즈 제품 사용, AS, 필터, 배수 관련 자주 찾는 안내입니다.",
      "궁금한 내용을 질문으로 입력해 주세요.",
      "모델별 안내가 필요한 경우 모델명을 함께 입력해 주세요."
    ],
    guideButtons: [
      webLinkButton("고객센터", "https://www.gatevision.co.kr/front/customerservice")
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
  }
};

const aliases = new Map([
  ["laurastar", "laurastar"],
  ["laura", "laurastar"],
  ["로라스타", "laurastar"],
  ["woods", "woods"],
  ["wood", "woods"],
  ["우즈", "woods"]
]);

export const DEFAULT_BRAND_KEY = "laurastar";

export function getBrandConfig(brandKey = DEFAULT_BRAND_KEY) {
  const normalized = aliases.get(String(brandKey || "").toLowerCase()) || DEFAULT_BRAND_KEY;
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
