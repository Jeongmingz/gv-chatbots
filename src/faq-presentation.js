import summaryOverrides from "../data/faq-summary-overrides.json" with { type: "json" };

const DEFAULT_SUMMARY_LIMIT = 240;
const DEFAULT_SECTION_LIMIT = 330;
const URL_PATTERN = /https?:\/\/[^\s)]+/gu;

function cleanText(value) {
  return String(value || "")
    .replace(URL_PATTERN, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function splitLongPart(value, limit) {
  const parts = [];
  let rest = value.trim();

  while (rest.length > limit) {
    const candidates = [
      rest.lastIndexOf("\n", limit),
      rest.lastIndexOf(". ", limit),
      rest.lastIndexOf(" ", limit)
    ];
    const splitAt = Math.max(...candidates);
    const end = splitAt >= Math.floor(limit * 0.55) ? splitAt + (rest[splitAt] === "." ? 1 : 0) : limit;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

export function chunkPresentationText(value, limit = DEFAULT_SECTION_LIMIT) {
  const text = cleanText(value);
  if (!text) return [];

  const units = text
    .split(/\n{1,}|(?<=[.!?])\s+/u)
    .flatMap((part) => splitLongPart(part, limit))
    .filter(Boolean);
  const chunks = [];
  let current = "";

  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = unit;
  }

  if (current) chunks.push(current);
  return chunks;
}

function deriveSummary(value, limit = DEFAULT_SUMMARY_LIMIT) {
  const text = cleanText(value);
  if (text.length <= limit) return text;

  const units = text.split(/\n{1,}|(?<=[.!?])\s+/u).filter(Boolean);
  let summary = "";

  for (const unit of units) {
    const candidate = summary ? `${summary}\n${unit}` : unit;
    if (candidate.length > limit) break;
    summary = candidate;
  }

  if (!summary) summary = text.slice(0, limit - 1).trimEnd();
  return `${summary}…`;
}

export function isDetailRequest(utterance) {
  const compact = String(utterance || "").replace(/\s+/g, "");
  return compact.includes("자세히보기") || compact.includes("상세보기") || compact.includes("전체내용");
}

export function detailRequestMessage(faq, selectedModel) {
  return [selectedModel, faq.question, "자세히 보기"].filter(Boolean).join(" ");
}

export function normalizeFaqPresentation(faq, resolvedAnswer) {
  const manual = {
    ...(faq.presentation || {}),
    ...(resolvedAnswer.presentation || {})
  };
  const answerText = cleanText(resolvedAnswer.answer);
  const hasManualDetailSections = Array.isArray(manual.detailSections);
  const detailSections = (hasManualDetailSections ? manual.detailSections : chunkPresentationText(answerText))
    .map((section) => typeof section === "string" ? section : [section.title, section.description].filter(Boolean).join("\n"))
    .map((section) => cleanText(section))
    .filter(Boolean);
  const curatedSummaryEntry = summaryOverrides[faq.id];
  const curatedSummary = typeof curatedSummaryEntry === "string"
    ? curatedSummaryEntry
    : curatedSummaryEntry?.[resolvedAnswer.selectedModel] || curatedSummaryEntry?.default;
  const summary = cleanText(manual.summary) || cleanText(curatedSummary) || deriveSummary(answerText) || "아래 버튼에서 확인해 주세요.";

  return {
    title: String(manual.title || faq.question || "안내").trim(),
    summary,
    detailSections,
    itemList: Array.isArray(manual.itemList) ? manual.itemList : null,
    itemListSummary: manual.itemListSummary || null,
    notice: cleanText(manual.notice),
    images: manual.images || resolvedAnswer.imagePaths || [],
    actions: manual.actions || [],
    hasDetails: hasManualDetailSections
      ? detailSections.length > 0
      : answerText.length > summary.length
  };
}
