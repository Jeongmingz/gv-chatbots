export function skillResponse(outputs, quickReplies = []) {
  return {
    version: "2.0",
    template: {
      outputs: outputs.slice(0, 3),
      quickReplies: quickReplies.slice(0, 10)
    }
  };
}

export function simpleTextOutput(text) {
  return {
    simpleText: {
      text: truncate(text, 1000)
    }
  };
}

function truncate(value, limit) {
  const text = String(value || "");
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function boundedButtons(buttons, limit = 3) {
  return buttons.slice(0, limit).map((button) => ({
    ...button,
    label: truncate(button.label, 14)
  }));
}

export function textCard({
  title,
  description,
  buttons = []
}) {
  const limitedTitle = truncate(title, 50);
  const descriptionLimit = Math.max(1, 400 - limitedTitle.length);

  const limitedButtons = boundedButtons(buttons);

  return {
    textCard: {
      title: limitedTitle,
      description: truncate(description, descriptionLimit),
      ...(limitedButtons.length
        ? { buttons: limitedButtons, buttonLayout: "vertical" }
        : {})
    }
  };
}

export function simpleImageOutput(imageUrl, altText) {
  return {
    simpleImage: {
      imageUrl,
      altText: truncate(altText, 50)
    }
  };
}

export function simpleText(text, quickReplies = []) {
  return skillResponse([simpleTextOutput(text)], quickReplies);
}

export function quickReply(label, messageText = label, extra) {
  return {
    label,
    action: "message",
    messageText,
    ...(extra ? { extra } : {})
  };
}

export function messageButton(label, messageText = label) {
  return {
    action: "message",
    label,
    messageText
  };
}

export function webLinkButton(label, webLinkUrl) {
  return {
    action: "webLink",
    label,
    webLinkUrl
  };
}

export function operatorButton(label = "상담원 연결") {
  return {
    action: "operator",
    label: truncate(label, 14)
  };
}

export function phoneButton(label, phoneNumber) {
  return {
    action: "phone",
    label: truncate(label, 14),
    phoneNumber: String(phoneNumber || "")
  };
}

export function shareButton(label = "답변 공유하기") {
  return {
    action: "share",
    label: truncate(label, 14)
  };
}

export function blockButton(label, blockId, extra) {
  return {
    action: "block",
    label: truncate(label, 14),
    blockId,
    ...(extra ? { extra } : {})
  };
}

export const DEFAULT_BASIC_CARD_THUMBNAIL =
  "https://www.laurastar.co.kr/assets/images/img546x546px_Smart.jpeg";

export function carouselHeader({ title, description, imageUrl, altText } = {}) {
  if (!title && !imageUrl) return null;
  return {
    title: truncate(title, 50),
    description: truncate(description, 100),
    thumbnail: {
      imageUrl: String(imageUrl || ""),
      ...(altText ? { altText: truncate(altText, 50) } : {})
    }
  };
}

export function isInformationalImage(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://example.com").pathname.toLowerCase();
    // Banners, intro images, FAQ category headers, and default thumbnails are NOT informational
    if (
      pathname.includes("intro") ||
      pathname.includes("banner") ||
      pathname.includes("chatbot_faq") ||
      pathname.includes("chatbot-faq") ||
      pathname.includes("img546x546px")
    ) {
      return false;
    }
    // Store POP, spec charts, part diagrams, how-to guides, manuals are informational
    return (
      pathname.startsWith("/assets/store/") ||
      pathname.startsWith("/faq_images/") ||
      pathname.includes("spec") ||
      pathname.includes("manual") ||
      pathname.includes("guide") ||
      pathname.includes("diagram") ||
      pathname.includes("pop") ||
      pathname.includes("chart")
    );
  } catch {
    return false;
  }
}

export function basicCard({
  title,
  description,
  buttons = [],
  thumbnail = DEFAULT_BASIC_CARD_THUMBNAIL,
  thumbnailLink,
  fixedRatio = false,
  altText
}) {
  const shouldShowImageButton = thumbnailLink && isInformationalImage(thumbnailLink);
  const imageButton = shouldShowImageButton
    ? webLinkButton("이미지 전체보기", thumbnailLink)
    : null;
  const limitedButtons = boundedButtons([
    ...(imageButton ? [imageButton] : []),
    ...buttons.filter((button) => button.webLinkUrl !== thumbnailLink)
  ]);
  const card = {
    title: truncate(title, 50),
    description: truncate(description, 230)
  };

  if (thumbnail) {
    card.thumbnail = {
      imageUrl: thumbnail,
      fixedRatio: Boolean(fixedRatio),
      ...(altText ? { altText: truncate(altText, 50) } : {}),
      ...(shouldShowImageButton ? { link: { web: thumbnailLink } } : {})
    };
  }

  if (limitedButtons.length) {
    card.buttons = limitedButtons;
    card.buttonLayout = "vertical";
  }

  return {
    basicCard: card
  };
}

export function basicCardCarousel(items, { header, fixedRatio = false } = {}) {
  const normalizedHeader = header?.title || header?.imageUrl
    ? carouselHeader(header)
    : header;

  return {
    carousel: {
      type: "basicCard",
      ...(normalizedHeader ? { header: normalizedHeader } : {}),
      items: items.slice(0, 10).map((item) => {
        const imageButton = item.thumbnailLink
          ? webLinkButton("이미지 전체보기", item.thumbnailLink)
          : null;
        const limitedButtons = boundedButtons([
          ...(imageButton ? [imageButton] : []),
          ...(item.buttons || []).filter((button) => button.webLinkUrl !== item.thumbnailLink)
        ]);
        const card = {
          title: truncate(item.title, 50),
          description: truncate(item.description, 230),
          thumbnail: {
            imageUrl: item.thumbnail || DEFAULT_BASIC_CARD_THUMBNAIL,
            fixedRatio: Boolean(item.fixedRatio ?? fixedRatio),
            ...(item.altText ? { altText: truncate(item.altText, 50) } : {}),
            ...(item.thumbnailLink ? { link: { web: item.thumbnailLink } } : {})
          }
        };

        if (limitedButtons.length) {
          card.buttons = limitedButtons;
          card.buttonLayout = "vertical";
        }

        return card;
      })
    }
  };
}

export function listCard({ title, items = [], buttons = [] }) {
  const limitedButtons = boundedButtons(buttons);
  const card = {
    header: {
      title: String(title || "안내")
    },
    items: items.slice(0, 5).map((item) => ({
      title: String(item.title || ""),
      ...(item.description ? { description: String(item.description) } : {}),
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.action ? { action: item.action } : {}),
      ...(item.messageText ? { messageText: item.messageText } : {}),
      ...(item.blockId ? { blockId: item.blockId } : {}),
      ...(item.extra ? { extra: item.extra } : {})
    }))
  };

  if (limitedButtons.length) {
    card.buttons = limitedButtons;
    card.buttonLayout = "vertical";
  }

  return { listCard: card };
}

export function itemCard({
  imageTitle,
  title,
  description,
  itemList = [],
  itemListSummary,
  itemListAlignment = "left",
  buttons = [],
  buttonLayout = "vertical"
}) {
  const limitedButtons = boundedButtons(buttons);
  const card = {
    ...(imageTitle ? {
      imageTitle: {
        ...(imageTitle.imageUrl ? { imageUrl: imageTitle.imageUrl } : {}),
        ...(imageTitle.title ? { title: truncate(imageTitle.title, 50) } : {}),
        ...(imageTitle.description ? { description: truncate(imageTitle.description, 100) } : {})
      }
    } : {}),
    ...(title ? { title: truncate(title, 50) } : {}),
    ...(description ? { description: truncate(description, 100) } : {}),
    itemList: itemList.slice(0, 10).map((item) => ({
      title: truncate(item.title, 50),
      description: truncate(item.description, 100)
    })),
    itemListAlignment,
    ...(itemListSummary ? {
      itemListSummary: {
        title: truncate(itemListSummary.title, 50),
        description: truncate(itemListSummary.description, 100)
      }
    } : {}),
    ...(limitedButtons.length ? { buttons: limitedButtons, buttonLayout } : {})
  };

  return { itemCard: card };
}

export function imageCardCarousel(images, {
  title = "이미지 안내",
  description = "이미지를 좌우로 넘겨 확인해 주세요.",
  buttons = [],
  header,
  fixedRatio = false
} = {}) {
  return basicCardCarousel(
    images.slice(0, 10).map((image, index) => {
      const imageUrl = image.imageUrl || image;
      const altText = image.altText || (images.length > 1 ? `${title} ${index + 1}/${images.length}` : title);
      return {
        title: images.length > 1 ? `${title} ${index + 1}/${images.length}` : title,
        description,
        thumbnail: imageUrl,
        thumbnailLink: imageUrl,
        fixedRatio,
        altText,
        buttons: index === images.length - 1 ? buttons : []
      };
    }),
    { header, fixedRatio }
  );
}

export function dedupeQuickReplies(quickReplies, limit = 10) {
  const seen = new Set();
  const deduped = [];

  for (const reply of quickReplies) {
    if (!reply?.label || seen.has(reply.label)) continue;
    seen.add(reply.label);
    deduped.push(reply);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export function faqToQuickReplies(faqs) {
  return dedupeQuickReplies(faqs.map((faq) => quickReply(faq.question)));
}

export function extractUtterance(payload) {
  return (
    payload?.action?.detailParams?.utterance?.value ||
    payload?.action?.detailParams?.utterance?.origin ||
    payload?.action?.params?.question ||
    payload?.action?.params?.utterance ||
    payload?.userRequest?.utterance ||
    ""
  );
}
