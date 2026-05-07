export function jsonWithFlatFaqs(data) {
  const flatFaqs = data.categories.flatMap((category) =>
    category.faqs.map((faq) => ({
      ...faq,
      categoryId: category.id,
      categoryName: category.name,
      categoryAliases: category.aliases || []
    }))
  );

  return {
    ...data,
    flatFaqs
  };
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "어떻게",
  "무엇인가요",
  "뭔가요",
  "뭐야",
  "뭐가",
  "알려줘",
  "해주세요",
  "하나요",
  "되나요",
  "돼요",
  "있나요",
  "같아요",
  "싶어요",
  "문의",
  "질문"
]);

const QUERY_SYNONYMS = [
  {
    patterns: ["고플러스", "고 플러스", "go plus", "go+", "go"],
    tokens: ["go+"]
  },
  {
    patterns: ["스마트"],
    tokens: ["smart"]
  },
  {
    patterns: ["리프트"],
    tokens: ["lift"]
  },
  {
    patterns: ["잇지", "이지"],
    tokens: ["izzi"]
  },
  {
    patterns: ["이기"],
    tokens: ["iggi"]
  },
  {
    patterns: ["사용설명서", "설명서", "매뉴얼"],
    tokens: ["설명서", "매뉴얼", "사용법"]
  },
  {
    patterns: ["정품등록", "제품등록"],
    tokens: ["정품등록", "시리얼", "보증"]
  },
  {
    patterns: ["안들어", "안 들어", "들어가지", "공급"],
    tokens: ["물공급", "들어가"]
  },
  {
    patterns: ["안열", "안 열", "열리지"],
    tokens: ["마개", "잠김", "열리"]
  },
  {
    patterns: ["안감", "안 감", "잠긴", "리와인더"],
    tokens: ["코드선", "잠김"]
  },
  {
    patterns: ["흔들", "한쪽이 떠", "균형"],
    tokens: ["흔들", "균형", "다리미판"]
  },
  {
    patterns: ["소리", "달그락", "소음"],
    tokens: ["소리", "달그락", "소음"]
  },
  {
    patterns: ["차이", "비교"],
    tokens: ["차이", "비교"]
  },
  {
    patterns: ["교체", "갈아"],
    tokens: ["교체"]
  },
  {
    patterns: ["호환", "맞나요"],
    tokens: ["호환"]
  },
  {
    patterns: ["취소", "취소하고"],
    tokens: ["취소", "반품", "교환"]
  }
];

function includesCompact(source, target) {
  const sourceCompact = normalizeText(source).replace(/\s+/g, "");
  const targetCompact = normalizeText(target).replace(/\s+/g, "");
  return Boolean(targetCompact) && sourceCompact.includes(targetCompact);
}

function compact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function stemToken(token) {
  return token
    .replace(/(입니다|합니다|해주세요|했어요|할게요|인가요|나요|어요|아요|해요|돼요|되요|요)$/u, "")
    .replace(/(으로|에서|에게|까지|부터|처럼|이라|라고|하고)$/u, "")
    .replace(/(는데|은데|지만|나요|인가|니까|으면|다면)$/u, "")
    .replace(/지$/u, "")
    .replace(/(은|는|이|가|을|를|의|에|로|과|와|도|만)$/u, "");
}

function tokenize(value, options = {}) {
  const expandSynonyms = options.expandSynonyms !== false;
  const normalized = normalizeText(value);
  const tokens = normalized
    .split(" ")
    .map(stemToken)
    .filter((token) => (token.length >= 2 || /^[imu]$/u.test(token)) && !STOP_WORDS.has(token));

  if (expandSynonyms) {
    const normalizedCompact = compact(value);
    for (const synonym of QUERY_SYNONYMS) {
      if (synonym.patterns.some((pattern) => normalizedCompact.includes(compact(pattern)))) {
        tokens.push(...synonym.tokens);
      }
    }
  }

  return [...new Set(tokens)];
}

function getProductAliases(faq) {
  return (faq.categoryAliases || [])
    .map(normalizeText)
    .filter(Boolean);
}

function hasProductHint(faq, query) {
  const queryCompact = compact(query);
  return getProductAliases(faq).some((alias) => queryCompact.includes(compact(alias)));
}

function hasWaterTypeIntent(query, queryTokens) {
  const queryCompact = compact(query);
  const hasWaterTerm =
    queryCompact.includes("물") ||
    queryTokens.some((token) =>
      ["수돗물", "정수물", "증류수", "생수", "물사용"].includes(token)
    );
  const hasUseTerm = queryTokens.some((token) =>
    token === "사용" || token.includes("사용") || token === "써" || token === "쓰"
  );
  const hasSymptomTerm = queryTokens.some((token) =>
    ["부족", "경고등", "물부족", "물공급", "들어가", "부레", "필터", "스팀"].includes(token)
  );

  return hasWaterTerm && !hasSymptomTerm && (hasUseTerm || queryTokens.includes("증류수"));
}

function scoreFaq(faq, query) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(query);
  const question = normalizeText(faq.question);
  const questionTokens = tokenize(faq.question, { expandSynonyms: false });
  const keywordTokens = (faq.keywords || []).flatMap((keyword) =>
    tokenize(keyword, { expandSynonyms: false })
  );
  const faqTerms = [...new Set([...questionTokens, ...keywordTokens])];
  const productHint = hasProductHint(faq, query);

  let score = 0;
  let strongSignals = 0;

  if (!normalizedQuery || !queryTokens.length) return 0;

  if (question === normalizedQuery) {
    score += 160;
    strongSignals += 2;
  }

  if (includesCompact(question, query) || includesCompact(query, question)) {
    score += 80;
    strongSignals += 1;
  }

  if (productHint) {
    score += 28;
  }

  if (
    faq.id === "common-water-type" &&
    normalizedQuery.includes("어떤 물을 사용")
  ) {
    score += 140;
    strongSignals += 2;
  }

  if (faq.id === "common-water-type" && hasWaterTypeIntent(query, queryTokens)) {
    score += 60;
    strongSignals += 1;
  }

  for (const token of queryTokens) {
    if (questionTokens.includes(token)) {
      score += token.length >= 3 ? 26 : 18;
      strongSignals += 1;
      continue;
    }

    if (keywordTokens.includes(token)) {
      score += token.length >= 3 ? 34 : 14;
      strongSignals += 1;
      continue;
    }

    if (faqTerms.some((term) => term.includes(token) || token.includes(term))) {
      score += 7;
    }
  }

  const matchedTermCount = queryTokens.filter((token) =>
    faqTerms.some((term) => term === token || term.includes(token) || token.includes(term))
  ).length;

  if (matchedTermCount >= 2) score += 18;
  if (matchedTermCount >= 3) score += 18;

  if (queryTokens.includes("차이") && !faqTerms.includes("차이")) score -= 30;
  if (queryTokens.includes("교체") && !faqTerms.includes("교체")) score -= 24;
  if (queryTokens.includes("호환") && !faqTerms.includes("호환")) score -= 24;
  if (queryTokens.includes("마개") && !faqTerms.includes("마개")) score -= 35;
  if (queryTokens.includes("코드선") && !faqTerms.includes("코드선")) score -= 60;
  if (queryTokens.includes("코드선") && faqTerms.includes("코드선")) score += 40;
  if (queryTokens.includes("다리미판") && !faqTerms.includes("다리미판")) score -= 18;
  if (faqTerms.includes("go+") && !queryTokens.includes("go+")) score -= 45;
  if ((faqTerms.includes("boss") || faqTerms.includes("보스")) && !queryTokens.some((token) => ["boss", "보스"].includes(token))) {
    score -= 35;
  }
  if (queryTokens.includes("물공급") && !faqTerms.some((term) => ["물공급", "보일러", "들어가"].includes(term))) {
    score -= 35;
  }

  const hasSpecificExactMatch = queryTokens.some((token) => token.length >= 3 && faqTerms.includes(token));
  if (!productHint && matchedTermCount < 2 && strongSignals < 2 && !hasSpecificExactMatch) return 0;

  return score;
}

export function searchFaq(data, query, options = {}) {
  const limit = options.limit || 5;
  const scored = data.flatFaqs
    .map((faq) => ({
      faq,
      score: scoreFaq(faq, query)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

export function findBestFaq(data, query) {
  const [best, second] = searchFaq(data, query, { limit: 2 });
  if (!best || best.score < 28) return null;
  if (second && best.score - second.score < 8 && best.score < 80) return null;
  return best;
}

export function getSuggestedFaqs(data, categoryId, limit = 5) {
  const candidates = categoryId
    ? data.flatFaqs.filter((faq) => faq.categoryId === categoryId)
    : data.flatFaqs;

  return candidates.slice(0, limit);
}
