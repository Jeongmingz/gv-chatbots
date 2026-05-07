import {
  basicCard,
  dedupeQuickReplies,
  faqToQuickReplies,
  quickReply,
  simpleTextOutput,
  skillResponse,
  webLinkButton
} from "./kakao.js";
import { getSuggestedFaqs, normalizeText, searchFaq } from "./faq.js";

const MANUAL_URL = "https://www.laurastar.co.kr/front/board/manual";
const REGISTRATION_URL = "https://www.laurastar.co.kr/front/login?param=serialregist";
const SCENARIO_CATEGORY_IDS = new Set(["as-service", "order-shipping-return"]);
const SCENARIO_KEYWORDS = [
  "as",
  "a/s",
  "교환",
  "수리",
  "반품",
  "취소",
  "환불",
  "접수"
];

const DEFAULT_QUICK_REPLIES = [
  quickReply("Smart 모델 차이"),
  quickReply("Lift 모델 차이"),
  quickReply("IGGI 마개가 안 열려요")
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

function categoryQuickReply(category) {
  if (!category) return null;
  return quickReply(`${category.name} 질문 보기`);
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

function buildAnswerText(match) {
  const { faq } = match;

  return [
    `문의하신 내용은 ${faq.categoryName} 항목으로 안내드립니다.`,
    "",
    faq.answer,
    "",
    "추가 확인이 필요한 경우 로라스타 공식 상담 메뉴를 이용해 주세요."
  ].join("\n");
}

function buildActionCard(faq) {
  const buttons = [...faqLinkButtons(faq)];

  if (!buttons.length) return null;

  return basicCard({
    title: "로라스타 공식 안내",
    description: "공식 페이지에서 자세한 내용을 확인하실 수 있습니다.",
    buttons
  });
}

function categoryResponse(data, category) {
  if (SCENARIO_CATEGORY_IDS.has(category.id)) {
    return scenarioHandoffResponse(category.name);
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
      simpleTextOutput(
        `[${category.name}]\n자주 문의하시는 항목입니다.\n\n${questionLines}`
      )
    ],
    quickReplies
  );
}

export function fallbackResponse(data) {
  return skillResponse(
    [
      simpleTextOutput(
        "문의 내용을 정확히 확인하지 못했습니다.\n\n제품명과 증상을 함께 입력해 주시면 더 정확한 안내가 가능합니다.\n예: Lift 필터 교체, IGGI 마개 안 열림, Smart 모델 차이"
      )
    ],
    dedupeQuickReplies([...DEFAULT_QUICK_REPLIES, ...SCENARIO_QUICK_REPLIES], 5)
  );
}

function scenarioHandoffResponse(topic = "상담") {
  return skillResponse(
    [
      simpleTextOutput(
        `${topic} 관련 문의는 전용 상담 메뉴에서 안내드립니다.\n\n아래 메뉴를 선택해 진행해 주세요.`
      )
    ],
    dedupeQuickReplies(SCENARIO_QUICK_REPLIES)
  );
}

export function buildSkillFaqResponse(data, utterance, match) {
  const category = getCategoryByUtterance(data, utterance);
  if (category) return categoryResponse(data, category);

  if (!match) return fallbackResponse(data);
  if (isScenarioFaq(match.faq)) return scenarioHandoffResponse(match.faq.categoryName);

  const related = searchFaq(data, utterance, { limit: 8 })
    .map((item) => item.faq)
    .filter((faq) => faq.id !== match.faq.id && !isScenarioFaq(faq));

  const outputs = [
    simpleTextOutput(buildAnswerText(match)),
    buildActionCard(match.faq)
  ].filter(Boolean);

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(related.slice(0, 1)),
    quickReply("사용 설명서"),
    ...SCENARIO_QUICK_REPLIES
  ].filter(Boolean), 3);

  return skillResponse(outputs, quickReplies);
}

export function buildGuideResponse() {
  return skillResponse(
    [
      basicCard({
        title: "로라스타 주요 바로가기",
        description: "자주 찾는 공식 안내 메뉴입니다.",
        buttons: [
          webLinkButton("매뉴얼", MANUAL_URL),
          webLinkButton("정품등록", REGISTRATION_URL)
        ]
      })
    ],
    dedupeQuickReplies([...DEFAULT_QUICK_REPLIES, ...SCENARIO_QUICK_REPLIES], 5)
  );
}
