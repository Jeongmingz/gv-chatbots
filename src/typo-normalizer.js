import { disassemble } from "es-hangul";
import { fuzzy } from "fast-fuzzy";
import typoData from "../data/typo-aliases.json" with { type: "json" };

const aliases = Object.entries(typoData.aliases || {})
  .sort(([left], [right]) => right.length - left.length);
const controlledTerms = [...new Set(typoData.terms || [])];
const protectedTerms = new Set(typoData.protected_terms || []);
const normalizationCache = new Map();
const MAX_CACHE_SIZE = 500;

const termCandidates = controlledTerms.map((term) => ({
  term,
  jamo: disassemble(term)
}));

function normalizeBase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceAllLiteral(value, source, target) {
  return value.split(source).join(target);
}

function stripParticle(token) {
  return token.replace(/(으로|에서|에게|까지|부터|처럼|이라|라고|하고|은|는|이|가|을|를|의|에|로|과|와|도|만)$/u, "");
}

function minimumScore(token) {
  if (token.length === 3) return 0.88;
  if (token.length === 4) return 0.86;
  return 0.84;
}

export function findTypoCorrection(token) {
  const normalized = normalizeBase(token).replace(/\s+/g, "");
  const core = stripParticle(normalized);

  if (core.length < 3 || protectedTerms.has(core) || controlledTerms.includes(core)) {
    return null;
  }

  const tokenJamo = disassemble(core);
  const ranked = termCandidates
    .map((candidate) => ({
      term: candidate.term,
      score: fuzzy(tokenJamo, candidate.jamo, {
        ignoreCase: true,
        ignoreSymbols: false,
        normalizeWhitespace: false,
        useDamerau: true,
        useSellers: false
      })
    }))
    .sort((left, right) => right.score - left.score);

  const [best, second] = ranked;
  if (!best || best.score < minimumScore(core)) return null;
  if (second && best.score - second.score < 0.08) return null;

  return {
    original: core,
    corrected: best.term,
    score: best.score,
    margin: best.score - (second?.score || 0)
  };
}

export function normalizeQueryTypos(value) {
  const cacheKey = String(value || "");
  const cached = normalizationCache.get(cacheKey);
  if (cached) return cached;

  const original = normalizeBase(value);
  let correctedText = original;
  const corrections = [];

  for (const [sourceValue, targetValue] of aliases) {
    const source = normalizeBase(sourceValue);
    const target = normalizeBase(targetValue);
    if (!source || !correctedText.includes(source)) continue;

    correctedText = replaceAllLiteral(correctedText, source, target);
    corrections.push({
      type: "alias",
      original: source,
      corrected: target,
      score: 1
    });
  }

  const tokens = correctedText.split(" ").filter(Boolean);
  const correctedTokens = tokens.map((token) => {
    const correction = findTypoCorrection(token);
    if (!correction) return token;
    corrections.push({ type: "fuzzy", ...correction });
    return correction.corrected;
  });

  const result = {
    original,
    normalized: correctedTokens.join(" "),
    changed: corrections.length > 0,
    corrections
  };

  if (normalizationCache.size >= MAX_CACHE_SIZE) {
    normalizationCache.delete(normalizationCache.keys().next().value);
  }
  normalizationCache.set(cacheKey, result);
  return result;
}
