import {
  basicCard,
  dedupeQuickReplies,
  faqToQuickReplies,
  quickReply,
  skillResponse,
  webLinkButton
} from "./kakao.js";
import { getSuggestedFaqs, normalizeText, searchFaq } from "./faq.js";

const MANUAL_URL = "https://www.laurastar.co.kr/front/board/manual";
const REGISTRATION_URL = "https://www.laurastar.co.kr/front/login?param=serialregist";
const CARD_THUMBNAIL_PATH = "/assets/laurastar-chatbot-intro.png";
const SCENARIO_CATEGORY_IDS = new Set(["as-service", "order-shipping-return"]);

const FREQUENT_FAQ_IDS = [
  "common-water-type",
  "common-manual-video",
  "common-product-registration",
  "smart-model-differences",
  "smart-vs-go-plus",
  "izzi-lift-filter-replacement",
  "iggi-cap-stuck",
  "board-cover-compatibility"
];

const SCENARIO_QUICK_REPLIES = [
  quickReply("AS/수리 문의"),
  quickReply("교환/반품/취소 문의")
];

function linkLabel(url, index) {
  if (url.includes("customerservice")) return "AS 접수";
  if (url.includes("serialregist")) return "정품등록";
  if (url.includes("manual")) return "매뉴얼";
  if (url.includes("brand.naver.com")) return "구매하기";
  if (url.includes("video.php") || url.includes("vo.la")) return "영상 보기";
  return `링크 ${index + 1}`;
}

function faqLinkButtons(faq) {
  return (faq.links || [])
    .filter((url) => !url.includes("customerservice"))
    .map((url, index) => webLinkButton(linkLabel(url, index), url));
}

function isScenarioFaq(faq) {
  if (!faq) return false;
  if (SCENARIO_CATEGORY_IDS.has(faq.categoryId)) return true;

  const question = normalizeText(faq.question);
  return SCENARIO_KEYWORDS.some((keyword) => question.includes(normalizeText(keyword)));
}

function getCategory(data, categoryId) {
  return data.categories.find((category) => category.id === categoryId);
}

function getCategoryByUtterance(data, utterance) {
  const normalized = normalizeText(utterance);
  if (!normalized) return null;

  const hasListIntent =
    normalized.includes("질문") ||
    normalized.includes("목록") ||
    normalized.includes("추천") ||
    normalized.includes("보기");

  if (!hasListIntent) return null;

  return data.categories.find((category) => {
    const names = [category.name, category.id, ...(category.aliases || [])];
    return names.some((name) => normalizeText(name) && normalized.includes(normalizeText(name)));
  });
}

function wantsFrequentList(utterance) {
  const normalized = normalizeText(utterance);
  const compacted = normalized.replace(/\s+/g, "");
  return (
    !normalized ||
    compacted.includes("자주묻") ||
    compacted.includes("자주하는") ||
    normalized.includes("faq") ||
    normalized.includes("질문 목록") ||
    normalized.includes("질문 리스트") ||
    normalized === "질문" ||
    normalized === "문의"
  );
}

function getFrequentFaqs(data) {
  return FREQUENT_FAQ_IDS
    .map((id) => data.flatFaqs.find((faq) => faq.id === id))
    .filter(Boolean);
}

function frequentFaqQuickReplies(data) {
  return dedupeQuickReplies([
    ...faqToQuickReplies(getFrequentFaqs(data)),
    ...SCENARIO_QUICK_REPLIES
  ], 10);
}

function buildAnswerText(lines) {
  const bodyLines = (Array.isArray(lines) ? lines : [lines])
    .flatMap((line) => String(line ?? "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);

  return [
    ...bodyLines,
    "",
    "추가 확인이 필요한 경우 로라스타 공식 상담 메뉴를 이용해 주세요."
  ].join("\n");
}

function buildTextCard(title, lines, thumbnail, buttons = []) {
  return basicCard({
    title,
    description: buildAnswerText(lines),
    buttons,
    thumbnail
  });
}

function buildAnswerCard(match, thumbnail) {
  const { faq } = match;
  const buttons = [...faqLinkButtons(faq)];

  return buildTextCard(faq.question, [faq.answer], thumbnail, buttons);
}

function cardThumbnailUrl(baseUrl) {
  if (!baseUrl) return undefined;
  return new URL(CARD_THUMBNAIL_PATH, baseUrl).toString();
}

function categoryResponse(data, category, baseUrl) {
  if (SCENARIO_CATEGORY_IDS.has(category.id)) {
    return scenarioHandoffResponse(category.name, baseUrl);
  }

  const suggestions = getSuggestedFaqs(data, category.id, 5);
  const questionLines = suggestions
    .map((faq, index) => `${index + 1}. ${faq.question}`)
    .join("\n");

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(suggestions.filter((faq) => !isScenarioFaq(faq))),
    ...SCENARIO_QUICK_REPLIES
  ], 6);

  return skillResponse(
    [
      buildTextCard(
        category.name,
        [
          "자주 문의하시는 항목입니다.",
          "",
          questionLines,
          "",
          "궁금한 항목을 선택하거나 질문을 그대로 입력해 주세요."
        ],
        cardThumbnailUrl(baseUrl)
      )
    ],
    quickReplies
  );
}

export function fallbackResponse(data, baseUrl) {
  return skillResponse(
    [
      buildTextCard(
        "안내",
        [
          "질문과 바로 연결되지 않았습니다.",
          "궁금한 내용을 다시 입력하거나 아래 빠른 메뉴를 선택해 주세요.",
          "AS/수리, 교환/반품/취소 문의는 전용 상담 메뉴를 이용해 주세요."
        ],
        cardThumbnailUrl(baseUrl)
      )
    ],
    frequentFaqQuickReplies(data)
  );
}

function scenarioHandoffResponse(topic = "상담", baseUrl) {
  return skillResponse(
    [
      buildTextCard(
        `${topic} 안내`,
        [
          `${topic} 관련 문의는 전용 상담 메뉴에서 안내드립니다.`,
          "",
          "아래 메뉴를 선택해 진행해 주세요."
        ],
        cardThumbnailUrl(baseUrl)
      )
    ],
    dedupeQuickReplies(SCENARIO_QUICK_REPLIES)
  );
}

export function buildSkillFaqResponse(data, utterance, match, baseUrl) {
  if (wantsFrequentList(utterance)) return fallbackResponse(data, baseUrl);

  const category = getCategoryByUtterance(data, utterance);
  if (category) return categoryResponse(data, category, baseUrl);

  if (!match) return fallbackResponse(data, baseUrl);
  if (isScenarioFaq(match.faq)) return scenarioHandoffResponse(match.faq.categoryName, baseUrl);

  const related = searchFaq(data, utterance, { limit: 8 })
    .map((item) => item.faq)
    .filter((faq) => faq.id !== match.faq.id && !isScenarioFaq(faq));

  const outputs = [buildAnswerCard(match, cardThumbnailUrl(baseUrl))];

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(related.slice(0, 1)),
    quickReply("사용 설명서"),
    ...SCENARIO_QUICK_REPLIES
  ].filter(Boolean), 3);

  return skillResponse(outputs, quickReplies);
}

export function buildGuideResponse(data, baseUrl) {
  return skillResponse(
    [
      buildTextCard(
        "로라스타 주요 바로가기",
        [
          "자주 찾는 공식 안내 메뉴입니다.",
          "궁금한 내용을 질문으로 입력해 주세요.",
          "아래 빠른 메뉴로도 안내받을 수 있습니다."
        ],
        cardThumbnailUrl(baseUrl),
        [webLinkButton("매뉴얼", MANUAL_URL), webLinkButton("정품등록", REGISTRATION_URL)]
      )
    ],
    frequentFaqQuickReplies(data)
  );
}
