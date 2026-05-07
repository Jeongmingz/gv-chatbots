function simpleText(text, quickReplies = []) {
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

function quickReply(label, messageText = label) {
  return {
    label,
    action: "message",
    messageText
  };
}

function faqToQuickReplies(faqs) {
  return faqs.slice(0, 10).map((faq) => quickReply(faq.question));
}

function extractUtterance(payload) {
  return (
    payload?.userRequest?.utterance ||
    payload?.action?.params?.question ||
    payload?.action?.params?.utterance ||
    ""
  );
}

module.exports = {
  extractUtterance,
  faqToQuickReplies,
  quickReply,
  simpleText
};
