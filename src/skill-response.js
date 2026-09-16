import {
  basicCard,
  blockButton,
  dedupeQuickReplies,
  faqToQuickReplies,
  imageCardCarousel,
  itemCard,
  listCard,
  operatorButton,
  phoneButton,
  quickReply,
  shareButton,
  simpleImageOutput,
  simpleTextOutput,
  skillResponse,
  textCard,
  webLinkButton
} from "./kakao.js";
import { brandSelectionMessage, getBrandChoices } from "./brands.js";
import {
  getContextualRelatedFaqs,
  getSuggestedFaqs,
  isGreetingQuery,
  normalizeText,
  searchFaq
} from "./faq.js";
import { buildTrackedUrl } from "./analytics.js";
import {
  detailRequestMessage,
  isDetailRequest,
  normalizeFaqPresentation
} from "./faq-presentation.js";
import { getProductFamilyFaqs } from "./product-catalog.js";
import { getSupportMenuFaqs, SUPPORT_MENUS } from "./support-menu.js";

const DEFAULT_RESPONSE_CONFIG = {
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
};

const BRAND_SELECTION_THUMBNAIL_PATH = "/assets/Gatevision_Chatbot_Intro.png";
const URL_PATTERN = /https?:\/\/[^\s)]+/gu;

function getResponseConfig(config) {
  return {
    ...DEFAULT_RESPONSE_CONFIG,
    responseLayout: "legacy",
    ...(config || {})
  };
}

function usesVisualLayout(config) {
  return String(config.responseLayout || "").toLowerCase() === "v2";
}

function linkLabel(url, index, labels = []) {
  const lowerUrl = String(url || "").toLowerCase();

  if (labels[index]) return labels[index];
  if (lowerUrl.includes("cswrite?brand=laurastar")) return "AS 접수";
  if (lowerUrl.includes("customerservice")) return "고객센터";
  if (lowerUrl.includes("registuser") || lowerUrl.includes("location=serialregist")) return "제품등록";
  if (lowerUrl.includes("serialregist")) return "정품등록";
  if (lowerUrl.includes("manual")) return "매뉴얼";
  if (lowerUrl.includes("aarke.co.kr/guide")) return "사용 가이드";
  if (lowerUrl.includes("litter-robot.kr/support/litter-robot-4/#tab-manuals")) return "설명서 보기";
  if (lowerUrl.includes("litter-robot.kr/support/article/")) return "상세 안내";
  if (lowerUrl.includes("litter-robot.kr/support/")) return "지원센터";
  if (lowerUrl.includes("product_no=764")) return "실린더 구매";
  if (lowerUrl.includes("/assets/store/")) return "매장 위치 크게 보기";
  if (lowerUrl.includes("/trialmember") || lowerUrl.includes("/storeinfo")) return "매장 위치 보기";
  if (
    lowerUrl.includes("brand.naver.com") ||
    lowerUrl.includes("smartstore.naver.com") ||
    lowerUrl.includes("curationa.com") ||
    lowerUrl.includes("gvcurate.com/product/") ||
    lowerUrl === "https://gvcurate.com/"
  ) return "구매하기";
  if (lowerUrl.includes("video.php") || lowerUrl.includes("vo.la")) return "영상 보기";
  return `링크 ${index + 1}`;
}

function extractUrls(value) {
  return String(value || "").match(URL_PATTERN) || [];
}

function hasUrl(value) {
  return /https?:\/\/[^\s)]+/u.test(String(value || ""));
}

function removeUrls(value) {
  return String(value || "")
    .replace(URL_PATTERN, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function answerButtonLabels(answer, links) {
  const lines = String(answer || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !hasUrl(line));
  return lines.length === links.length && lines.every((line) => line.length <= 16) ? lines : [];
}

function resolveLinkUrl(baseUrl, url) {
  if (/^https?:\/\//u.test(String(url || ""))) return url;
  return baseUrl ? assetUrl(baseUrl, url) : url;
}

function linkButtons(links, labels = [], baseUrl, context = {}) {
  const seen = new Set();
  const uniqueLinks = [];

  for (const url of links) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    uniqueLinks.push(url);
  }

  return uniqueLinks.map((url, index) => {
    const label = linkLabel(url, index, labels);
    const resolved = resolveLinkUrl(baseUrl, url);
    const webLinkUrl = context?.enableLinkTracking && baseUrl
      ? buildTrackedUrl(baseUrl, resolved, { ...context, label })
      : resolved;
    return webLinkButton(label, webLinkUrl);
  });
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

export function wantsChannelFriendBenefit(value) {
  const compact = String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, "");
  return (
    compact.includes("채널추가") ||
    compact.includes("친구추가") ||
    compact.includes("채널혜택") ||
    compact.includes("카톡채널") ||
    compact.includes("플친추가")
  );
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

  return bodyLines.join("\n");
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

  const base = compacted.endsWith("pro") ? compacted.replace(/pro$/u, "") : compacted;
  aliases.add(base);

  const match = base.match(/^([a-z]+)(\d+)([a-z]*)$/u);
  if (match) {
    const [, prefix, num, suffix] = match;
    aliases.add(`${prefix}${num}`);
    if (suffix) {
      aliases.add(`${num}${suffix}`);
    }
    if (prefix.length >= 3) {
      aliases.add(prefix);
    }
  }

  if (compacted.includes("carbonator")) {
    aliases.add(compacted.replace(/carbonator/gu, "카보네이터").replace(/pro$/gu, "프로"));
    aliases.add(compacted.replace(/carbonator/gu, "카보").replace(/pro$/gu, "프로"));
  }

  if (compacted.startsWith("smart")) {
    aliases.add(compacted.replace(/^smart/gu, "스마트"));
  }

  if (compacted.startsWith("izzi")) {
    aliases.add(compacted.replace(/^izzi/gu, "잇지"));
    aliases.add(compacted.replace(/^izzi/gu, "이지"));
  }

  if (compacted.startsWith("litterrobot")) {
    aliases.add(compacted.replace(/^litterrobot/gu, "리터로봇"));
  }

  return [...aliases].sort((a, b) => b.length - a.length);
}

function findSelectedModel(faq, utterance) {
  const availableModels = faq.available_models || Object.keys(faq.model_answers || {});
  const normalizedUtterance = modelKey(utterance);

  return availableModels.find((model) =>
    modelAliases(model).some((alias) => normalizedUtterance.includes(alias))
  );
}

export function resolveFaqAnswer(faq, utterance) {
  if (faq.answer_type !== "per_model") {
    return {
      answer: faq.answer,
      imagePaths: faq.imagePaths || (faq.imagePath ? [faq.imagePath] : []),
      links: faq.links || [],
      presentation: faq.presentation,
      selectedModel: null,
      needsModelSelection: false
    };
  }

  const selectedModel = findSelectedModel(faq, utterance);
  if (selectedModel && faq.model_answers?.[selectedModel]?.answer) {
    const modelAnswer = faq.model_answers[selectedModel];
    const imagePaths =
      modelAnswer.imagePaths ||
      faq.imagePaths ||
      (modelAnswer.imagePath || faq.imagePath ? [modelAnswer.imagePath || faq.imagePath] : []);
    return {
      answer: modelAnswer.answer,
      imagePaths,
      links: modelAnswer.links || faq.links || [],
      presentation: modelAnswer.presentation,
      selectedModel,
      needsModelSelection: false
    };
  }

  return {
    answer: faq.model_selection_prompt || "사용 중인 모델을 선택해 주세요.",
    imagePaths: [],
    links: [],
    presentation: faq.presentation,
    selectedModel: null,
    needsModelSelection: true
  };
}

function modelQuickReplies(faq) {
  const models = faq.available_models || Object.keys(faq.model_answers || {});
  return models.map((model) => quickReply(model, `${model} ${faq.question}`));
}

function configuredQuickReplies(faq) {
  return (faq.quick_replies || []).map((reply) =>
    quickReply(reply.label, reply.messageText || reply.label)
  );
}

function buildAnswerOutputs(match, utterance, thumbnail, config) {
  const { faq } = match;
  const answer = resolveFaqAnswer(faq, utterance);
  const answerUrls = extractUrls(answer.answer);
  const answerLinks = [...(answer.links || []), ...answerUrls];
  const labels = answerButtonLabels(answer.answer, answerLinks);
  const trackingContext = {
    brand: config?.key,
    faqId: faq?.id,
    userId: config?.userId,
    enableLinkTracking: Boolean(config?.enableLinkTracking)
  };
  const buttons = linkButtons([...(faq.links || []), ...answerLinks], labels, config.baseUrl, trackingContext);
  const displayAnswer = removeUrls(answer.answer) || "아래 버튼에서 확인해 주세요.";
  const outputs = [
    simpleTextOutput(buildAnswerText([displayAnswer], config))
  ];

  for (const [index, imagePath] of answer.imagePaths.entries()) {
    outputs.push(
      simpleImageOutput(
        assetUrl(config.baseUrl, imagePath),
        answer.selectedModel
          ? `${answer.selectedModel} ${faq.question} 이미지 ${index + 1}`
          : `${faq.question} 이미지 ${index + 1}`
      )
    );
  }

  if (buttons.length) {
    outputs.push(
      buildTextCard(
        "관련 링크",
        ["아래 버튼에서 확인해 주세요."],
        thumbnail,
        config,
        buttons
      )
    );
  }

  return outputs;
}

function dedupeButtons(buttons) {
  const seen = new Set();
  return buttons.filter((button) => {
    const key = button.webLinkUrl || `${button.action}:${button.label}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visualAnswerButtons(faq, answer, presentation, config) {
  const trackingContext = {
    brand: config?.key,
    faqId: faq?.id,
    userId: config?.userId,
    enableLinkTracking: Boolean(config?.enableLinkTracking)
  };

  const manualButtons = presentation.actions
    .map((action) => {
      if (action.type === "operator" || action.action === "operator") {
        return operatorButton(action.label || "상담원 연결");
      }
      if (action.type === "phone" || action.action === "phone") {
        return phoneButton(action.label || "전화 연결", action.phoneNumber || config.csPhoneNumber);
      }
      if (action.type === "share" || action.action === "share") {
        return shareButton(action.label || "답변 공유하기");
      }
      if (action.label && action.url) {
        const resolved = resolveLinkUrl(config.baseUrl, action.url);
        const webLinkUrl = config.enableLinkTracking && config.baseUrl
          ? buildTrackedUrl(config.baseUrl, resolved, { ...trackingContext, label: action.label })
          : resolved;
        return webLinkButton(action.label, webLinkUrl);
      }
      return null;
    })
    .filter(Boolean);

  const answerUrls = extractUrls(answer.answer);
  const answerLinks = [...(answer.links || []), ...answerUrls];
  const labels = answerButtonLabels(answer.answer, answerLinks);
  const inferredButtons = linkButtons([...(faq.links || []), ...answerLinks], labels, config.baseUrl, trackingContext)
    .map((button) => {
      const faqIntent = normalizeText(`${faq.categoryId || ""} ${faq.categoryName || ""} ${faq.question || ""}`);
      const isAsAnswer = /(^|\s)as($|\s)/u.test(faqIntent);
      if (isAsAnswer && button.webLinkUrl?.includes("customerservice")) {
        return { ...button, label: "AS 접수" };
      }
      return button;
    });

  const buttons = dedupeButtons([...manualButtons, ...inferredButtons]);
  if ((faq.shareable || presentation.shareable) && buttons.length < 3) {
    buttons.push(shareButton("답변 공유하기"));
  }

  return buttons.slice(0, 3);
}

function visualImageUrls(images, config) {
  return images
    .map((path) => resolveLinkUrl(config.baseUrl, path))
    .filter(Boolean);
}

function isInChatExplanationImage(imageUrl) {
  try {
    return !new URL(imageUrl).pathname.startsWith("/assets/store/");
  } catch {
    return true;
  }
}

function inChatImageOutputs(images, title) {
  return images.slice(0, 2).map((imageUrl, index) =>
    simpleImageOutput(
      imageUrl,
      images.length > 1 ? `${title} ${index + 1}/${images.length}` : title
    )
  );
}

function summaryDescription(presentation) {
  return [presentation.summary, presentation.notice ? `⚠️ ${presentation.notice}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function buildVisualAnswerOutputs(match, utterance, config, answer) {
  const { faq } = match;
  const presentation = normalizeFaqPresentation(faq, answer);
  const buttons = visualAnswerButtons(faq, answer, presentation, config);
  const images = visualImageUrls(presentation.images, config);
  const showImagesInChat = images.length > 0 && images.every(isInChatExplanationImage);

  if (faq.id === "base-greeting") {
    return [
      basicCard({
        title: presentation.title,
        description: summaryDescription(presentation),
        thumbnail: images[0] || cardThumbnailUrl(config.baseUrl, config),
        thumbnailLink: images[0] || cardThumbnailUrl(config.baseUrl, config),
        buttons
      })
    ];
  }

  if (answer.needsModelSelection) {
    return [
      textCard({
        title: presentation.title,
        description: presentation.summary
      })
    ];
  }

  if (presentation.itemList && presentation.itemList.length > 0) {
    return [
      itemCard({
        imageTitle: images[0] ? { imageUrl: images[0], title: presentation.title } : undefined,
        title: images[0] ? undefined : presentation.title,
        description: summaryDescription(presentation),
        itemList: presentation.itemList,
        itemListSummary: presentation.itemListSummary || undefined,
        buttons
      })
    ];
  }

  if (isDetailRequest(utterance) && presentation.hasDetails) {
    const sections = presentation.detailSections.slice(0, 3);

    if (showImagesInChat) {
      const imageOutputs = inChatImageOutputs(images, presentation.title);
      const availableTextOutputs = Math.max(1, 3 - imageOutputs.length);
      const visibleSections = sections.slice(0, availableTextOutputs);
      const textOutputs = visibleSections.map((section, index) =>
        textCard({
          title: visibleSections.length > 1
            ? `${presentation.title} · ${index + 1}/${visibleSections.length}`
            : presentation.title,
          description: section,
          buttons: index === visibleSections.length - 1 ? buttons : []
        })
      );

      return [...textOutputs, ...imageOutputs].slice(0, 3);
    }

    const includeImages = images.length > 0 && sections.length <= 2;
    const outputs = sections.map((section, index) =>
      textCard({
        title: `${presentation.title} · ${index + 1}/${sections.length}`,
        description: section,
        buttons: !includeImages && index === sections.length - 1 ? buttons : []
      })
    );

    if (includeImages) {
      outputs.push(
        imageCardCarousel(images, {
          title: presentation.title,
          description: "이미지를 좌우로 넘겨 확인해 주세요.",
          buttons
        })
      );
    }

    return outputs.slice(0, 3);
  }

  if (showImagesInChat) {
    return [
      textCard({
        title: presentation.title,
        description: summaryDescription(presentation),
        buttons
      }),
      ...inChatImageOutputs(images, presentation.title)
    ].slice(0, 3);
  }

  if (images.length === 1) {
    return [
      basicCard({
        title: presentation.title,
        description: summaryDescription(presentation),
        thumbnail: images[0],
        thumbnailLink: images[0],
        buttons
      })
    ];
  }

  const outputs = [
    textCard({
      title: presentation.title,
      description: summaryDescription(presentation),
      buttons
    })
  ];

  if (images.length > 1) {
    outputs.push(
      imageCardCarousel(images, {
        title: presentation.title,
        description: "이미지를 좌우로 넘겨 확인해 주세요."
      })
    );
  }

  return outputs;
}

function visualQuickReplies(faq, answer, presentation, related, config, utterance) {
  if (answer.needsModelSelection) {
    return dedupeQuickReplies(modelQuickReplies(faq), 10);
  }

  const consultationReply = config.actionQuickReplies
    .find(([label]) => label.includes("상담"));
  const relatedReplies = related.slice(0, 1).map((relatedFaq) => {
    const messageText = answer.selectedModel && relatedFaq.answer_type === "per_model"
      ? `${answer.selectedModel} ${relatedFaq.question}`
      : relatedFaq.question;
    const compactLabel = relatedFaq.question
      .replace(/[?？]/gu, "")
      .replace(/(해주세요|하나요|있나요|되나요|인가요)$/u, "")
      .trim();

    return quickReply(
      compactLabel.length > 14 ? `${compactLabel.slice(0, 13).trimEnd()}…` : compactLabel,
      messageText
    );
  });

  return dedupeQuickReplies([
    ...configuredQuickReplies(faq),
    ...(!isDetailRequest(utterance) && presentation.hasDetails
      ? [quickReply("자세히 보기", detailRequestMessage(faq, answer.selectedModel))]
      : []),
    ...(faq.suppress_action_replies ? [] : relatedReplies),
    ...(config.isFriend === false ? [quickReply("채널 추가 혜택", "채널 추가 혜택")] : []),
    ...(faq.suppress_action_replies
      ? []
      : (consultationReply ? [quickReply(consultationReply[0], consultationReply[1])] : []))
  ], 4);
}

function cardThumbnailUrl(baseUrl, config) {
  if (!baseUrl) return undefined;
  return new URL(config.thumbnailPath, baseUrl).toString();
}

function assetUrl(baseUrl, path) {
  if (!baseUrl) return undefined;
  return new URL(path, baseUrl).toString();
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
  const fallbackButtons = [
    operatorButton("상담원 연결"),
    ...(config.csPhoneNumber ? [phoneButton("고객센터 전화", config.csPhoneNumber)] : [])
  ];

  if (usesVisualLayout(config) && config.productFamilies?.length) {
    const frequentFaqs = getFrequentFaqs(data, config).slice(0, 5);
    return skillResponse(
      [
        textCard({
          title: "답변을 찾지 못했어요",
          description: "문의하실 제품을 선택하면 관련 질문을 다시 안내해 드릴게요. 제품명·모델명과 증상을 함께 입력하셔도 됩니다.",
          buttons: fallbackButtons
        }),
        listCard({
          title: "어떤 제품 문의인가요?",
          items: config.productFamilies.slice(0, 5).map((product) => ({
            title: product.name,
            description: product.description,
            action: "message",
            messageText: `${product.name} 문의`,
            extra: {
              brand: config.key,
              productFamilyId: product.id
            }
          }))
        }),
        listCard({
          title: "자주 묻는 질문",
          items: frequentFaqs.map((faq) => ({
            title: faq.question,
            action: "message",
            messageText: faq.question
          }))
        })
      ],
      [quickReply("상담사 연결", "상담원 연결")]
    );
  }

  return skillResponse(
    [
      buildTextCard(
        "안내",
        [
          "질문과 바로 연결되지 않았습니다.",
          "궁금한 내용을 다시 입력하거나 아래 빠른 메뉴를 선택해 주세요."
        ],
        cardThumbnailUrl(baseUrl, config),
        config,
        fallbackButtons
      )
    ],
    frequentFaqQuickReplies(data, config)
  );
}

export function buildProductFamilyResponse(data, productFamily) {
  const faqs = getProductFamilyFaqs(data, productFamily, 5);

  if (!faqs.length) {
    return skillResponse(
      [
        textCard({
          title: productFamily.name,
          description: "아직 이 제품군에 연결된 자주 묻는 질문이 없습니다. 제품명·모델명과 증상을 함께 입력하거나 상담사 연결을 선택해 주세요."
        })
      ],
      [quickReply("상담사 연결", "상담원 연결")]
    );
  }

  return skillResponse(
    [
      textCard({
        title: productFamily.name,
        description: "선택하신 제품의 자주 묻는 질문입니다. 궁금한 항목을 선택하거나 증상을 직접 입력해 주세요."
      }),
      listCard({
        title: `${productFamily.name} 자주 묻는 질문`,
        items: faqs.map((faq) => ({
          title: faq.question,
          action: "message",
          messageText: faq.question
        }))
      })
    ],
    [quickReply("상담사 연결", "상담원 연결")]
  );
}

export function buildChannelFriendBenefitResponse(data, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);
  const brandName = data.brand || "브랜드";
  const brandKey = config.key || "laurastar";

  const brandBenefits = {
    laurastar: "• 공식 정품등록 시 무상 보증 1년 추가 (총 2년)\n• 필터/커버 등 정품 소모품 할인 쿠폰 제공\n• 1:1 카카오 전문 상담 및 신제품 소식",
    woods: "• 제습기/가습기 정품등록 및 무상 보증 연장\n• SMF 항균 필터 교체 주기 알림 및 할인\n• 전문 상담원 1:1 빠른 상담 지원",
    aarke: "• 정품등록 혜택 및 전용 보틀/실린더 특가 알림\n• 탄산 실린더 맞교환 충전 예약 간편 안내\n• 1:1 채팅 고객지원 서비스",
    "litter-robot": "• 리터로봇 4 정품등록 및 무상 보증 혜택\n• 리터호퍼, 전용 라이너/필터 할인 쿠폰\n• 센서 관리 및 오류 해결 1:1 빠른 안내",
    imetec: "• 이탈리아 이메텍 정품등록 및 보증 서비스\n• 전용 조절기/소모품 구매 혜택 및 할인\n• 세탁/보관 가이드 및 1:1 전문 상담 지원"
  };

  const specificBenefit = brandBenefits[brandKey] || "• 공식 정품등록 및 보증 서비스\n• 전용 소모품 할인 쿠폰 및 특가 소식\n• 1:1 전문 상담원 채팅 지원";

  const lines = [
    `[${brandName} 카카오톡 채널 추가 혜택]`,
    specificBenefit,
    "",
    "💡 채널 추가 방법:",
    "화면 오른쪽 상단의 [Ch+] 버튼을 누르시면 채널 추가가 완료됩니다."
  ];

  const trackingContext = {
    brand: config?.key,
    userId: config?.userId,
    enableLinkTracking: Boolean(config?.enableLinkTracking)
  };

  const rawButtons = [
    ...(config.guideButtons?.length ? [config.guideButtons[0]] : []),
    webLinkButton("공식몰 바로가기", "https://gvcurate.com")
  ];

  const buttons = rawButtons.map((btn) => {
    if (btn.action === "webLink" && config.enableLinkTracking && baseUrl) {
      return webLinkButton(
        btn.label,
        buildTrackedUrl(baseUrl, btn.webLinkUrl, {
          ...trackingContext,
          label: btn.label,
          targetType: "CHANNEL_BENEFIT"
        })
      );
    }
    return btn;
  });

  const output = buildTextCard(
    `${brandName} 채널 추가 혜택 안내`,
    lines,
    cardThumbnailUrl(baseUrl, config),
    config,
    buttons
  );

  const quickReplies = dedupeQuickReplies([
    quickReply("자주 찾는 질문", "자주 찾는 질문"),
    quickReply("상담원 연결", "상담원 연결")
  ], 4);

  return skillResponse([output], quickReplies);
}

export function buildSkillFaqResponse(data, utterance, match, baseUrl, responseConfig) {
  const config = {
    ...getResponseConfig(responseConfig),
    baseUrl
  };

  if (wantsChannelFriendBenefit(utterance)) {
    return buildChannelFriendBenefitResponse(data, baseUrl, config);
  }

  if (wantsFrequentList(utterance) && !match?.faq?.suppress_action_replies) {
    return fallbackResponse(data, baseUrl, config);
  }

  const category = isDetailRequest(utterance) ? null : getCategoryByUtterance(data, utterance);
  if (category) return categoryResponse(data, category, baseUrl, config);

  if (!match) return fallbackResponse(data, baseUrl, config);

  const answer = resolveFaqAnswer(match.faq, utterance);
  const related = usesVisualLayout(config)
    ? getContextualRelatedFaqs(data, match.faq, utterance, {
        limit: 4,
        selectedModel: answer.selectedModel
      })
    : searchFaq(data, utterance, { limit: 8 })
        .map((item) => item.faq)
        .filter((faq) => faq.id !== match.faq.id);

  if (usesVisualLayout(config)) {
    const presentation = normalizeFaqPresentation(match.faq, answer);
    return skillResponse(
      buildVisualAnswerOutputs(match, utterance, config, answer),
      visualQuickReplies(match.faq, answer, presentation, related, config, utterance)
    );
  }

  const outputs = buildAnswerOutputs(match, utterance, cardThumbnailUrl(baseUrl, config), config);

  const quickReplies = dedupeQuickReplies([
    ...configuredQuickReplies(match.faq),
    ...(answer.needsModelSelection ? modelQuickReplies(match.faq) : []),
    ...(match.faq.suppress_action_replies ? [] : faqToQuickReplies(related.slice(0, 1))),
    ...(config.isFriend === false ? [quickReply("채널 추가 혜택", "채널 추가 혜택")] : []),
    ...(match.faq.suppress_action_replies
      ? []
      : config.actionQuickReplies.map(([label, messageText]) => quickReply(label, messageText)))
  ].filter(Boolean), 4);

  return skillResponse(outputs, quickReplies);
}

export function buildGuideResponse(data, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);
  const trackingContext = {
    brand: config?.key,
    userId: config?.userId,
    enableLinkTracking: Boolean(config?.enableLinkTracking)
  };

  const guideButtons = (config.guideButtons || []).map((btn) => {
    if (btn.action === "webLink" && config.enableLinkTracking && baseUrl) {
      return webLinkButton(
        btn.label,
        buildTrackedUrl(baseUrl, btn.webLinkUrl, {
          ...trackingContext,
          label: btn.label,
          targetType: "GUIDE"
        })
      );
    }
    return btn;
  });

  return skillResponse(
    [
      buildTextCard(
        config.guideTitle,
        config.guideLines,
        cardThumbnailUrl(baseUrl, config),
        config,
        guideButtons
      )
    ],
    frequentFaqQuickReplies(data, config)
  );
}

export function buildBrandWelcomeResponse(data, baseUrl, responseConfig) {
  const config = getResponseConfig(responseConfig);
  const title = `${data.brand} 문의 메뉴`;
  const output = usesVisualLayout(config)
    ? listCard({
        title,
        items: SUPPORT_MENUS.map((menu) => ({
          title: menu.name,
          description: menu.description,
          action: "message",
          messageText: menu.name,
          extra: {
            brand: config.key,
            supportMenuId: menu.id
          }
        }))
      })
    : buildTextCard(
        title,
        ["문의 유형을 선택해 주세요."],
        cardThumbnailUrl(baseUrl, config),
        config
      );

  return skillResponse([output], [quickReply("상담사 연결", "상담원 연결")]);
}

function supportMenuNavigationReplies(config) {
  return [
    quickReply("메인 메뉴", "메인 메뉴", {
      brand: config.key,
      supportMenuId: "main"
    }),
    quickReply("상담사 연결", "상담원 연결")
  ];
}

export function buildSupportMenuResponse(data, menu, responseConfig) {
  const config = getResponseConfig(responseConfig);

  if (menu.id === "main") {
    return buildBrandWelcomeResponse(data, config.baseUrl, config);
  }

  if (menu.id === "product") {
    return skillResponse(
      [
        textCard({
          title: "제품관련 문의",
          description: "문의하실 제품을 선택해 주세요."
        }),
        listCard({
          title: "제품 선택",
          items: (config.productFamilies || []).slice(0, 5).map((product) => ({
            title: product.name,
            description: product.description,
            action: "message",
            messageText: `${product.name} 문의`,
            extra: {
              brand: config.key,
              productFamilyId: product.id
            }
          }))
        })
      ],
      supportMenuNavigationReplies(config)
    );
  }

  const faqs = getSupportMenuFaqs(data, menu.id, 5);
  if (!faqs.length) {
    return skillResponse(
      [
        textCard({
          title: menu.name,
          description: "현재 바로 안내할 수 있는 항목이 없습니다. 문의 내용을 직접 입력하거나 상담사 연결을 선택해 주세요."
        })
      ],
      supportMenuNavigationReplies(config)
    );
  }

  return skillResponse(
    [
      listCard({
        title: menu.name,
        items: faqs.map((faq) => ({
          title: faq.question,
          action: "message",
          messageText: faq.question
        }))
      })
    ],
    supportMenuNavigationReplies(config)
  );
}

export function buildBrandSelectionResponse(utterance, baseUrl) {
  const query = String(utterance || "").trim();

  if (isGreetingQuery(query)) {
    const lines = [
      "안녕하세요! 프리미엄 해외 라이프스타일 가전 공식 수입원 (주)게이트비젼 고객센터입니다. 😊",
      "",
      "문의하실 브랜드를 아래에서 선택해 주시면 전문적이고 빠른 상담을 도와드리겠습니다."
    ];

    return skillResponse(
      [
        basicCard({
          title: "게이트비젼 고객센터",
          description: lines.join("\n"),
          thumbnail: assetUrl(baseUrl, BRAND_SELECTION_THUMBNAIL_PATH)
        })
      ],
      [
        ...getBrandChoices().map((brand) =>
          quickReply(brand.label, brandSelectionMessage(brand.key, ""))
        ),
        quickReply("상담원 연결", "상담원 연결")
      ]
    );
  }

  const lines = [
    "문의하실 브랜드를 선택해 주세요."
  ];

  if (query) {
    lines.push(`질문: ${query}`);
  }

  return skillResponse(
    [
      basicCard({
        title: "브랜드 선택",
        description: lines.join("\n"),
        thumbnail: assetUrl(baseUrl, BRAND_SELECTION_THUMBNAIL_PATH)
      })
    ],
    [
      ...getBrandChoices().map((brand) =>
        quickReply(brand.label, brandSelectionMessage(brand.key, query))
      ),
      quickReply("다른 브랜드", "상담원 연결")
    ]
  );
}

export function withBrandChangeQuickReply(response, { primaryLimit = 2 } = {}) {
  const quickReplies = response?.template?.quickReplies || [];
  const modelSelectionReplies = quickReplies.filter((reply) =>
    /^[A-Z0-9]+(?:FW)?(?:\s+PRO)?$/u.test(reply.label)
  );

  if (modelSelectionReplies.length >= 3) {
    return response;
  }

  const primaryReplies = quickReplies.filter((reply) =>
    !["브랜드 변경", "상담원 연결", "상담사 연결"].includes(reply.label)
  );

  return {
    ...response,
    template: {
      ...response.template,
      quickReplies: dedupeQuickReplies([
        ...primaryReplies.slice(0, primaryLimit),
        quickReply("상담사 연결", "상담원 연결"),
        quickReply("브랜드 변경")
      ], Math.min(primaryLimit + 2, 10))
    }
  };
}
