import fs from "node:fs";
import path from "node:path";
import { getBrandConfig } from "../src/brands.js";
import { findBestFaq } from "../src/faq.js";
import { resolveFaqAnswer } from "../src/skill-response.js";

const WORKSPACE = process.cwd();
const scenariosPath = path.join(WORKSPACE, "test/answer-validity-scenarios.json");
const outputPath = process.argv[2] || path.join(WORKSPACE, "outputs/answer-validity-baseline.json");

if (!fs.existsSync(path.dirname(outputPath))) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

const scenarios = JSON.parse(fs.readFileSync(scenariosPath, "utf8"));

export function resolveAction(match, utterance) {
  if (!match || !match.faq) return "REJECT";
  const id = match.faq.id;
  if (id.startsWith("disambiguation-") || id === "base-insufficient-detail") {
    return "CLARIFY";
  }
  if (id === "base-human-handoff") {
    return "HANDOFF";
  }
  if (id.startsWith("base-")) {
    return "SYSTEM";
  }
  if (match.faq.answer_type === "per_model") {
    const resolved = resolveFaqAnswer(match.faq, utterance);
    if (resolved.needsModelSelection) {
      return "CLARIFY";
    }
  }
  return "MATCH";
}

export function getActualAnswerText(match, utterance) {
  if (!match || !match.faq) return "";
  const resolved = resolveFaqAnswer(match.faq, utterance);
  return resolved.answer || "";
}

export function checkPolarity(text, expectedPolarity) {
  if (!expectedPolarity || expectedPolarity === "informational") return { pass: true };
  if (expectedPolarity === "prohibition") {
    const hasProhibition = /(권장하지\s*않|사용하지\s*말|사용하지마|금지|삼가|불가|안\s*됩니다|안\s*돼요|위험이\s*있|변형|주의)/u.test(text);
    return { pass: hasProhibition, reason: hasProhibition ? null : "금지 표현 미검출" };
  }
  if (expectedPolarity === "permission") {
    const hasPermission = /(사용\s*가능|가능합니다|사용할\s*수\s*있|안전하게\s*사용|권장드립니다)/u.test(text);
    const hasNegation = /(사용\s*가능하지\s*않|가능하지\s*않|할\s*수\s*없)/u.test(text);
    const pass = hasPermission && !hasNegation;
    return { pass, reason: pass ? null : "허용 표현 미검출 또는 부정문 감지" };
  }
  if (expectedPolarity === "conditional") {
    const hasCondition = /(경우|이상|이하|미만|초과|다만|단,|조건)/u.test(text);
    return { pass: hasCondition, reason: hasCondition ? null : "조건부 표현 미검출" };
  }
  return { pass: true };
}

export function safeDecode(str) {
  try {
    return decodeURIComponent(str || "");
  } catch {
    return str || "";
  }
}

export function checkForbiddenFacts(text, forbiddenFacts = []) {
  const decodedText = safeDecode(text);
  for (const fact of forbiddenFacts) {
    if (fact === "사용 가능") {
      if (/(사용\s*가능(합니다|한|해요|이며))/u.test(decodedText) && !/(사용\s*가능하지\s*않)/u.test(decodedText)) {
        return { pass: false, violatedFact: fact };
      }
    } else if (decodedText.includes(fact)) {
      return { pass: false, violatedFact: fact };
    }
  }
  return { pass: true };
}

export function checkRequiredFacts(text, requiredFacts = []) {
  const decodedText = safeDecode(text);
  const missing = requiredFacts.filter((f) => !decodedText.includes(f));
  return { pass: missing.length === 0, missing };
}

export function evaluateScenario(scenario) {
  const brandConfig = getBrandConfig(scenario.brand);
  if (!brandConfig) {
    throw new Error(`Unknown brand: ${scenario.brand}`);
  }

  const match = findBestFaq(brandConfig.data, scenario.query);
  const actualAction = resolveAction(match, scenario.query);
  const actualFaqId = match?.faq?.id || null;
  const actualFaqQuestion = match?.faq?.question || null;
  const actualText = getActualAnswerText(match, scenario.query);
  const actualScore = match?.score || 0;

  const isInScope = scenario.category.startsWith("IN_SCOPE");
  const isOos =
    scenario.category === "OUT_OF_SCOPE" ||
    scenario.category === "KEYWORD_TRAP" ||
    scenario.category === "PREDICATE_MISMATCH";

  const actionAllowed = scenario.acceptableActions.includes(actualAction);

  let passed = false;
  let isTrueMatch = false;
  let isTrueReject = false;
  let isTrueClarify = false;
  let isTrueHandoff = false;
  let isTrueSystem = false;
  let isWrongMatch = false;
  let failureReason = null;
  let matchedSpec = null;

  if (!actionAllowed) {
    passed = false;
    failureReason = `기대 액션 [${scenario.acceptableActions.join(", ")}] 불일치: 실제 액션 [${actualAction}] (${actualFaqId})`;
    if (actualAction === "MATCH") {
      isWrongMatch = true;
    }
  } else {
    if (actualAction === "MATCH") {
      let matchedAnySpec = false;
      for (const spec of scenario.acceptableAnswers || []) {
        if (spec.faqId !== actualFaqId) continue;

        const reqCheck = checkRequiredFacts(actualText, spec.requiredFacts);
        if (!reqCheck.pass) {
          failureReason = `FAQ ${actualFaqId} 필수 팩트 누락: [${reqCheck.missing.join(", ")}]`;
          continue;
        }

        const forbidCheck = checkForbiddenFacts(actualText, spec.forbiddenFacts);
        if (!forbidCheck.pass) {
          failureReason = `FAQ ${actualFaqId} 금지 팩트 포함: "${forbidCheck.violatedFact}"`;
          continue;
        }

        const polCheck = checkPolarity(actualText, spec.polarity);
        if (!polCheck.pass) {
          failureReason = `FAQ ${actualFaqId} 극성(${spec.polarity}) 불일치: ${polCheck.reason}`;
          continue;
        }

        matchedAnySpec = true;
        matchedSpec = spec;
        break;
      }

      if (matchedAnySpec) {
        passed = true;
        isTrueMatch = true;
      } else {
        passed = false;
        isWrongMatch = true;
        if (!failureReason) {
          failureReason = `허용 FAQ ID [${(scenario.acceptableAnswers || []).map((s) => s.faqId).join(", ")}]에 매칭되지 않음: ${actualFaqId}`;
        }
      }
    } else if (actualAction === "REJECT") {
      passed = true;
      isTrueReject = true;
    } else if (actualAction === "CLARIFY") {
      passed = true;
      isTrueClarify = true;
    } else if (actualAction === "HANDOFF") {
      passed = true;
      isTrueHandoff = true;
    } else if (actualAction === "SYSTEM") {
      passed = true;
      isTrueSystem = true;
    }
  }

  return {
    id: scenario.id,
    brand: scenario.brand,
    query: scenario.query,
    category: scenario.category,
    isInScope,
    isOos,
    acceptableActions: scenario.acceptableActions,
    actualAction,
    actualFaqId,
    actualFaqQuestion,
    actualScore,
    actualTextSnippet: actualText.slice(0, 100).replace(/\n/g, " "),
    passed,
    isTrueMatch,
    isTrueReject,
    isTrueClarify,
    isTrueHandoff,
    isTrueSystem,
    isWrongMatch,
    failureReason,
    matchedSpec
  };
}

export function runBenchmark() {
  const results = scenarios.map(evaluateScenario);

  const totalQueries = results.length;
  const totalInScope = results.filter((r) => r.isInScope).length;
  const totalOos = results.filter((r) => r.isOos).length;
  const totalMatchActions = results.filter((r) => r.actualAction === "MATCH").length;

  const trueMatches = results.filter((r) => r.isTrueMatch).length;
  const trueRejects = results.filter((r) => r.isTrueReject).length;
  const trueClarifies = results.filter((r) => r.isTrueClarify).length;
  const trueHandoffs = results.filter((r) => r.isTrueHandoff).length;
  const trueSystems = results.filter((r) => r.isTrueSystem).length;

  const wrongMatches = results.filter((r) => r.isWrongMatch).length;
  const falseMatchesOnOos = results.filter((r) => r.isOos && r.actualAction === "MATCH").length;
  const falseRejectsOnInScope = results.filter((r) => r.isInScope && r.actualAction === "REJECT").length;

  const inScopeMatches = results.filter((r) => r.isInScope && r.actualAction === "MATCH").length;
  const inScopeTrueMatches = results.filter((r) => r.isInScope && r.isTrueMatch).length;

  const answerCoverage = totalQueries > 0 ? totalMatchActions / totalQueries : 0;
  const correctAnswerCoverage = totalQueries > 0 ? trueMatches / totalQueries : 0;
  const selectiveRisk = totalMatchActions > 0 ? wrongMatches / totalMatchActions : 0;
  const oosFpr = totalOos > 0 ? falseMatchesOnOos / totalOos : 0;
  const frr = totalInScope > 0 ? falseRejectsOnInScope / totalInScope : 0;
  const inScopePrecision = inScopeMatches > 0 ? inScopeTrueMatches / inScopeMatches : 0;
  const strictAccuracy =
    totalQueries > 0
      ? (trueMatches + trueRejects + trueClarifies + trueHandoffs + trueSystems) / totalQueries
      : 0;

  const metrics = {
    totalQueries,
    totalInScope,
    totalOos,
    totalMatchActions,
    trueMatches,
    trueRejects,
    trueClarifies,
    trueHandoffs,
    trueSystems,
    wrongMatches,
    falseMatchesOnOos,
    falseRejectsOnInScope,
    answerCoverage: Number((answerCoverage * 100).toFixed(2)),
    correctAnswerCoverage: Number((correctAnswerCoverage * 100).toFixed(2)),
    selectiveRisk: Number((selectiveRisk * 100).toFixed(2)),
    oosFpr: Number((oosFpr * 100).toFixed(2)),
    frr: Number((frr * 100).toFixed(2)),
    inScopePrecision: Number((inScopePrecision * 100).toFixed(2)),
    strictAccuracy: Number((strictAccuracy * 100).toFixed(2))
  };

  const outputData = {
    timestamp: new Date().toISOString(),
    metrics,
    results
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

  console.log("\n========================================================");
  console.log("   FAQ 정답 부합성 & 미보유 거절(Abstention) 평가 리포트   ");
  console.log("========================================================");
  console.log(`전체 평가 질의 수:           ${totalQueries}개 (In-Scope: ${totalInScope}개, Out-of-Scope: ${totalOos}개)`);
  console.log(`--------------------------------------------------------`);
  console.log(`[핵심 품질 지표]`);
  console.log(`1. Strict Accuracy (엄격 정확도):        ${metrics.strictAccuracy}% (${trueMatches + trueRejects + trueClarifies + trueHandoffs + trueSystems}/${totalQueries})`);
  console.log(`2. OOS False Positive Rate (미보유 오매칭률): ${metrics.oosFpr}% (${falseMatchesOnOos}/${totalOos}) -> [목표: 0%]`);
  console.log(`3. Selective Risk (답변 선택 위험도):     ${metrics.selectiveRisk}% (${wrongMatches}/${totalMatchActions}) -> [목표: 0%]`);
  console.log(`4. In-Scope Precision (인스코프 정밀도):  ${metrics.inScopePrecision}% (${inScopeTrueMatches}/${inScopeMatches}) -> [목표: >=98%]`);
  console.log(`5. False Reject Rate (불필요한 거절률):   ${metrics.frr}% (${falseRejectsOnInScope}/${totalInScope})`);
  console.log(`6. Answer Coverage (답변 커버리지):       ${metrics.answerCoverage}% (${totalMatchActions}/${totalQueries})`);
  console.log(`7. Correct Answer Coverage (정답 커버리지): ${metrics.correctAnswerCoverage}% (${trueMatches}/${totalQueries})`);
  console.log(`--------------------------------------------------------`);

  const failures = results.filter((r) => !r.passed);
  console.log(`\n[실패/결함 케이스 분석] 총 ${failures.length}건 / ${totalQueries}건`);
  failures.forEach((f, idx) => {
    console.log(`\n${idx + 1}. [${f.brand}] "${f.query}" (${f.category})`);
    console.log(`   - 기대 액션:  ${f.acceptableActions.join(", ")}`);
    console.log(`   - 실제 액션:  ${f.actualAction} -> ${f.actualFaqId || "(none)"} (점수: ${f.actualScore})`);
    console.log(`   - 실패 원인:  ${f.failureReason}`);
    if (f.actualTextSnippet) {
      console.log(`   - 실제 답변:  "${f.actualTextSnippet}..."`);
    }
  });

  return { metrics, results, failures };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runBenchmark();
}
