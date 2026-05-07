import {
  basicCard,
  basicCardCarousel,
  dedupeQuickReplies,
  faqToQuickReplies,
  messageButton,
  quickReply,
  simpleTextOutput,
  skillResponse,
  webLinkButton
} from "./kakao.js";
import { getSuggestedFaqs, normalizeText, searchFaq } from "./faq.js";

const AS_URL = "https://www.gatevision.co.kr/front/customerservice";
const MANUAL_URL = "https://www.laurastar.co.kr/front/board/manual";
const REGISTRATION_URL = "https://www.laurastar.co.kr/front/login?param=serialregist";

const DEFAULT_QUICK_REPLIES = [
  quickReply("Smart 모델 차이"),
  quickReply("Lift 모델 차이"),
  quickReply("IZZI 필터 교체"),
  quickReply("IGGI 마개가 안 열려요"),
  quickReply("AS 접수 방법")
];

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function linkLabel(url, index) {
  if (url.includes("customerservice")) return "AS 접수";
  if (url.includes("serialregist")) return "정품등록";
  if (url.includes("manual")) return "매뉴얼";
  if (url.includes("brand.naver.com")) return "구매하기";
  if (url.includes("video.php") || url.includes("vo.la")) return "영상 보기";
  return `링크 ${index + 1}`;
}

function faqLinkButtons(faq) {
  return (faq.links || []).map((url, index) => webLinkButton(linkLabel(url, index), url));
}

function needsAsGuide(faq) {
  const text = normalizeText(`${faq.question} ${faq.answer} ${(faq.keywords || []).join(" ")}`);
  return text.includes("as") || text.includes("수리") || text.includes("접수") || text.includes("불량");
}

function categoryQuickReply(category) {
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
  const { faq, score } = match;
  const confidence = score >= 45 ? "높음" : score >= 20 ? "보통" : "낮음";

  return [
    `[${faq.categoryName}]`,
    `Q. ${faq.question}`,
    "",
    faq.answer,
    "",
    `검색 확신도: ${confidence}`
  ].join("\n");
}

function buildActionCard(faq, category) {
  const buttons = [
    ...faqLinkButtons(faq),
    messageButton("관련 질문", `${category.name} 질문 보기`)
  ];

  if (needsAsGuide(faq) && !buttons.some((button) => button.webLinkUrl === AS_URL)) {
    buttons.unshift(webLinkButton("AS 접수", AS_URL));
  }

  if (!buttons.length) return null;

  return basicCard({
    title: "바로가기",
    description: truncate(`${faq.question} 관련 추가 확인 메뉴입니다.`, 120),
    buttons
  });
}

function relatedCarousel(related) {
  if (!related.length) return null;

  return basicCardCarousel(
    related.slice(0, 5).map((faq) => ({
      title: truncate(faq.question, 40),
      description: truncate(faq.answer, 90),
      buttons: [messageButton("답변 보기", faq.question), ...faqLinkButtons(faq)]
    }))
  );
}

function categoryResponse(data, category) {
  const suggestions = getSuggestedFaqs(data, category.id, 8);
  const outputs = [
    simpleTextOutput(
      `[${category.name}]\n아래 질문 중 궁금한 항목을 선택해 주세요.`
    ),
    relatedCarousel(suggestions)
  ].filter(Boolean);

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(suggestions),
    quickReply("AS 접수 방법"),
    quickReply("사용 설명서"),
    quickReply("정품 등록")
  ]);

  return skillResponse(outputs, quickReplies);
}

export function fallbackResponse(data) {
  const categoryCards = data.categories.map((category) => ({
    title: category.name,
    description: `${category.faqs.length}개 질문`,
    buttons: [messageButton("질문 보기", `${category.name} 질문 보기`)]
  }));

  return skillResponse(
    [
      simpleTextOutput(
        "문의 내용을 찾지 못했습니다. 제품명과 증상을 함께 입력하거나 아래 항목을 선택해 주세요."
      ),
      basicCardCarousel(categoryCards)
    ],
    dedupeQuickReplies(DEFAULT_QUICK_REPLIES)
  );
}

export function buildSkillFaqResponse(data, utterance, match) {
  const category = getCategoryByUtterance(data, utterance);
  if (category) return categoryResponse(data, category);

  if (!match) return fallbackResponse(data);

  const currentCategory = getCategory(data, match.faq.categoryId);
  const related = searchFaq(data, utterance, { limit: 8 })
    .map((item) => item.faq)
    .filter((faq) => faq.id !== match.faq.id);

  const outputs = [
    simpleTextOutput(buildAnswerText(match)),
    buildActionCard(match.faq, currentCategory),
    relatedCarousel(related)
  ].filter(Boolean);

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(related),
    currentCategory ? categoryQuickReply(currentCategory) : null,
    quickReply("AS 접수 방법"),
    quickReply("사용 설명서"),
    quickReply("정품 등록")
  ].filter(Boolean));

  return skillResponse(outputs, quickReplies);
}

export function buildGuideResponse() {
  return skillResponse(
    [
      basicCard({
        title: "로라스타 주요 바로가기",
        description: "자주 찾는 공식 안내 메뉴입니다.",
        buttons: [
          webLinkButton("AS 접수", AS_URL),
          webLinkButton("매뉴얼", MANUAL_URL),
          webLinkButton("정품등록", REGISTRATION_URL)
        ]
      })
    ],
    dedupeQuickReplies(DEFAULT_QUICK_REPLIES)
  );
}
