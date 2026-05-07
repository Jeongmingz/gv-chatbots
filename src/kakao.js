export function skillResponse(outputs, quickReplies = []) {
  return {
    version: "2.0",
    template: {
      outputs,
      quickReplies
    }
  };
}

export function simpleTextOutput(text) {
  return {
    simpleText: {
      text
    }
  };
}

export function simpleText(text, quickReplies = []) {
  return skillResponse([simpleTextOutput(text)], quickReplies);
}

export function quickReply(label, messageText = label) {
  return {
    label,
    action: "message",
    messageText
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

export const DEFAULT_BASIC_CARD_THUMBNAIL =
  "https://www.laurastar.co.kr/assets/images/img546x546px_Smart.jpeg";

export function basicCard({
  title,
  description,
  buttons = [],
  thumbnail = DEFAULT_BASIC_CARD_THUMBNAIL
}) {
  const limitedButtons = buttons.slice(0, 3);
  const card = {
    title,
    description,
    thumbnail: {
      imageUrl: thumbnail
    }
  };

  if (limitedButtons.length) {
    card.buttons = limitedButtons;
  }

  return {
    basicCard: card
  };
}

export function basicCardCarousel(items) {
  return {
    carousel: {
      type: "basicCard",
      items: items.slice(0, 10).map((item) => {
        const limitedButtons = (item.buttons || []).slice(0, 3);
        const card = {
          title: item.title,
          description: item.description,
          thumbnail: {
            imageUrl: item.thumbnail || DEFAULT_BASIC_CARD_THUMBNAIL
          }
        };

        if (limitedButtons.length) {
          card.buttons = limitedButtons;
        }

        return card;
      })
    }
  };
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
