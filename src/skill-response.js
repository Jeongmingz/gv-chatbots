import {
  basicCard,
  dedupeQuickReplies,
  faqToQuickReplies,
  quickReply,
  skillResponse,
  webLinkButton
} from "./kakao.js";
import { getSuggestedFaqs, normalizeText, searchFaq } from "./faq.js";

const DEFAULT_RESPONSE_CONFIG = {
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
};

function getResponseConfig(config) {
  return {
    ...DEFAULT_RESPONSE_CONFIG,
    ...(config || {})
  };
}

function linkLabel(url, index) {
  if (url.includes("cswrite?brand=laurastar")) return "AS 접수";
  if (url.includes("serialregist")) return "정품등록";
  if (url.includes("manual")) return "매뉴얼";
  if (url.includes("brand.naver.com")) return "구매하기";
  if (url.includes("video.php") || url.includes("vo.la")) return "영상 보기";
  return `링크 ${index + 1}`;
}

function faqLinkButtons(faq) {
  return (faq.links || [])
    .map((url, index) => webLinkButton(linkLabel(url, index), url));
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

function getFrequentFaqs(data, config) {
  return config.frequentFaqIds
    .map((id) => data.flatFaqs.find((faq) => faq.id === id))
    .filter(Boolean);
}

function frequentFaqQuickReplies(data, config) {
  return dedupeQuickReplies(faqToQuickReplies(getFrequentFaqs(data, config)), 10);
}

function buildAnswerText(lines, config) {
  const bodyLines = (Array.isArray(lines) ? lines : [lines])
    .flatMap((line) => String(line ?? "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);

  return [
    ...bodyLines,
    "",
    config.supportFooter
  ].join("\n");
}

function buildTextCard(title, lines, thumbnail, config, buttons = []) {
  return basicCard({
    title,
    description: buildAnswerText(lines, config),
    buttons,
    thumbnail
  });
}

function modelKey(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function modelAliases(model) {
  const compacted = modelKey(model);
  const aliases = new Set([compacted]);

  if (compacted.endsWith("pro")) {
    aliases.add(compacted.replace(/pro$/u, ""));
  }

  return [...aliases];
}

function findSelectedModel(faq, utterance) {
  const availableModels = faq.available_models || Object.keys(faq.model_answers || {});
  const normalizedUtterance = modelKey(utterance);

  return availableModels.find((model) =>
    modelAliases(model).some((alias) => normalizedUtterance.includes(alias))
  );
}

function resolveFaqAnswer(faq, utterance) {
  if (faq.answer_type !== "per_model") {
    return {
      answer: faq.answer,
      selectedModel: null,
      needsModelSelection: false
    };
  }

  const selectedModel = findSelectedModel(faq, utterance);
  if (selectedModel && faq.model_answers?.[selectedModel]?.answer) {
    return {
      answer: faq.model_answers[selectedModel].answer,
      selectedModel,
      needsModelSelection: false
    };
  }

  return {
    answer: faq.model_selection_prompt || "사용 중인 모델을 선택해 주세요.",
    selectedModel: null,
    needsModelSelection: true
  };
}

function modelQuickReplies(faq) {
  const models = faq.available_models || Object.keys(faq.model_answers || {});
  return models.map((model) => quickReply(model, `${model} ${faq.question}`));
}

function buildAnswerCard(match, utterance, thumbnail, config) {
  const { faq } = match;
  const buttons = [...faqLinkButtons(faq)];
  const answer = resolveFaqAnswer(faq, utterance);
  const title = answer.selectedModel ? `${faq.question} (${answer.selectedModel})` : faq.question;

  return buildTextCard(title, [answer.answer], thumbnail, config, buttons);
}

function cardThumbnailUrl(baseUrl, config) {
  if (config.thumbnailPath === null) return null;
  if (!baseUrl) return undefined;
  return new URL(config.thumbnailPath, baseUrl).toString();
}

function categoryResponse(data, category, baseUrl, config) {
  const suggestions = getSuggestedFaqs(data, category.id, 5);
  const questionLines = suggestions
    .map((faq, index) => `${index + 1}. ${faq.question}`)
    .join("\n");

  const quickReplies = dedupeQuickReplies([
    ...faqToQuickReplies(suggestions)
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
        cardThumbnailUrl(baseUrl, config),
        config
      )
    ],
    quickReplies
  );
}

export function fallbackResponse(data, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);

  return skillResponse(
    [
      buildTextCard(
        "안내",
        [
          "질문과 바로 연결되지 않았습니다.",
          "궁금한 내용을 다시 입력하거나 아래 빠른 메뉴를 선택해 주세요."
        ],
        cardThumbnailUrl(baseUrl, config),
        config
      )
    ],
    frequentFaqQuickReplies(data, config)
  );
}

export function buildSkillFaqResponse(data, utterance, match, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);

  if (wantsFrequentList(utterance)) return fallbackResponse(data, baseUrl, config);

  const category = getCategoryByUtterance(data, utterance);
  if (category) return categoryResponse(data, category, baseUrl, config);

  if (!match) return fallbackResponse(data, baseUrl, config);

  const related = searchFaq(data, utterance, { limit: 8 })
    .map((item) => item.faq)
    .filter((faq) => faq.id !== match.faq.id);
  const answer = resolveFaqAnswer(match.faq, utterance);

  const outputs = [buildAnswerCard(match, utterance, cardThumbnailUrl(baseUrl, config), config)];

  const quickReplies = dedupeQuickReplies([
    ...(answer.needsModelSelection ? modelQuickReplies(match.faq) : []),
    ...faqToQuickReplies(related.slice(0, 1)),
    ...config.actionQuickReplies.map(([label, messageText]) => quickReply(label, messageText))
  ].filter(Boolean), 4);

  return skillResponse(outputs, quickReplies);
}

export function buildGuideResponse(data, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);

  return skillResponse(
    [
      buildTextCard(
        config.guideTitle,
        config.guideLines,
        cardThumbnailUrl(baseUrl, config),
        config,
        config.guideButtons
      )
    ],
    frequentFaqQuickReplies(data, config)
  );
}
