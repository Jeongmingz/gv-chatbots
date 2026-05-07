export function simpleText(text, quickReplies = []) {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text
          }
        }
      ],
      quickReplies
    }
  };
}

export function quickReply(label, messageText = label) {
  return {
    label,
    action: "message",
    messageText
  };
}

export function faqToQuickReplies(faqs) {
  return faqs.slice(0, 10).map((faq) => quickReply(faq.question));
}

export function extractUtterance(payload) {
  return (
    payload?.userRequest?.utterance ||
    payload?.action?.params?.question ||
    payload?.action?.params?.utterance ||
    ""
  );
}
