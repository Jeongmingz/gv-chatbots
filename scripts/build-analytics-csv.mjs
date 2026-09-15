import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getBrandConfig } from "../src/brands.js";
import { findBestFaq } from "../src/faq.js";

const sourcePath = process.argv[2];
const unmatchedPath = process.argv[3];
const outputDir = process.argv[4];

if (!sourcePath || !unmatchedPath || !outputDir) {
  throw new Error("Usage: node scripts/build-analytics-csv.mjs <history.json> <unmatched.json> <output-dir>");
}

const rows = JSON.parse(fs.readFileSync(sourcePath, "utf8"))
  .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
const historicalUnmatched = JSON.parse(fs.readFileSync(unmatchedPath, "utf8"));
fs.mkdirSync(outputDir, { recursive: true });

const fullStart = rows[0]?.occurred_at || "";
const fullEnd = rows.at(-1)?.occurred_at || "";
const baselineStart = "2026-05-20T22:17:36.044";
const baselineEnd = "2026-06-28T20:06:43.030";
const deploymentStart = "2026-06-29T19:00:00.000";
const generatedAt = "2026-06-30T10:30:00.000";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filename, records, columns = null) {
  const keys = columns || [...new Set(records.flatMap((record) => Object.keys(record)))];
  const body = [keys.join(","), ...records.map((record) => keys.map((key) => csvEscape(record[key])).join(","))];
  fs.writeFileSync(path.join(outputDir, filename), `\uFEFF${body.join("\n")}\n`);
}

function hashUser(userId) {
  if (!userId) return "";
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "");
}

function isExplicitHandoff(row) {
  return ["상담원연결", "상담사연결", "직원연결"].includes(compact(row.query));
}

function isKnownTest(row) {
  if (/^(deploy-verification|brand-session|codex-session|test-)/u.test(row.user_id || "")) return true;
  if (row.user_id) return false;
  if (row.occurred_at < deploymentStart) return false;
  return [
    "IGGI 마개가 안열려요",
    "SW22FW 필터 청소",
    "구입했는데 장품등록을 어떻게 하나오",
    "파란불 다섯칸 깜빡여",
    "실린더충전 접수",
    "실린덜 충전 접수",
    "파란불 다섯칸 깜빡임"
  ].includes(row.query);
}

function recordClass(row) {
  if (isKnownTest(row)) return "deployment_test";
  if (!row.user_id) return "unknown_no_user_id";
  return "production_user";
}

function toUtcMs(value) {
  return new Date(`${value}Z`).getTime();
}

function datePart(value) {
  return value.slice(0, 10);
}

function monthPart(value) {
  return value.slice(0, 7);
}

function weekStart(value) {
  const date = new Date(`${datePart(value)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthEnd(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function calendarDaysInclusive(start, end) {
  return Math.floor((toUtcMs(`${end}T00:00:00.000`) - toUtcMs(`${start}T00:00:00.000`)) / 86400000) + 1;
}

function pct(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

const classifiedRows = rows.map((row) => ({ ...row, record_class: recordClass(row) }));
const productionRows = classifiedRows.filter((row) => row.record_class !== "deployment_test");
const userRows = productionRows.filter((row) => row.user_id);

const rawRows = classifiedRows.map((row) => ({
  history_id: row.id,
  occurred_at_kst: row.occurred_at,
  inserted_at_kst: row.inserted_at,
  date_kst: datePart(row.occurred_at),
  week_start_kst: weekStart(row.occurred_at),
  month_kst: monthPart(row.occurred_at),
  record_class: row.record_class,
  brand: row.brand,
  brand_name: row.brand_name,
  method: row.method,
  path: row.path,
  source: row.source,
  user_hash: hashUser(row.user_id),
  query: row.query,
  query_normalized: row.query_normalized,
  query_length: row.query_length,
  matched: row.matched,
  score: row.score,
  faq_id: row.faq_id,
  faq_question: row.faq_question,
  category_id: row.category_id,
  category_name: row.category_name,
  answer_type: row.answer_type,
  selected_model: row.selected_model,
  query_corrected: row.metadata?.queryCorrected || "",
  typo_corrections: row.metadata?.typoCorrections || [],
  explicit_handoff_utterance: isExplicitHandoff(row)
}));

const byUser = Map.groupBy(userRows, (row) => row.user_id);
const sessions = [];
for (const [userId, events] of byUser) {
  const sorted = [...events].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  let current = [];
  for (const event of sorted) {
    if (current.length && toUtcMs(event.occurred_at) - toUtcMs(current.at(-1).occurred_at) > 30 * 60 * 1000) {
      sessions.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length) sessions.push(current);
}

const sessionRows = sessions
  .sort((left, right) => left[0].occurred_at.localeCompare(right[0].occurred_at))
  .map((events, index) => {
    const first = events[0];
    const last = events.at(-1);
    const matchedCount = events.filter((row) => row.matched).length;
    const handoffObserved = events.some(isExplicitHandoff);
    return {
      session_id: `S${String(index + 1).padStart(4, "0")}`,
      user_hash: hashUser(first.user_id),
      session_start_kst: first.occurred_at,
      session_end_kst: last.occurred_at,
      date_kst: datePart(first.occurred_at),
      week_start_kst: weekStart(first.occurred_at),
      month_kst: monthPart(first.occurred_at),
      brand: first.brand,
      request_count: events.length,
      matched_count: matchedCount,
      unmatched_count: events.length - matchedCount,
      first_query: first.query,
      last_query: last.query,
      final_matched: Boolean(last.matched),
      final_faq_id: last.faq_id || "",
      explicit_handoff_observed: handoffObserved,
      one_turn_matched_end_proxy: events.length === 1 && Boolean(first.matched) && !handoffObserved,
      faq_end_proxy: Boolean(last.matched) && !handoffObserved,
      duration_minutes: Number(((toUtcMs(last.occurred_at) - toUtcMs(first.occurred_at)) / 60000).toFixed(1)),
      interpretation_limit: "FAQ 종료 추정은 해결 완료 또는 상담 미연결을 증명하지 않음"
    };
  });

function aggregate(records, sessionsForPeriod, periodType, periodStart, periodEnd, brand) {
  const total = records.length;
  const matched = records.filter((row) => row.matched).length;
  const unmatched = total - matched;
  const uniqueUsers = new Set(records.map((row) => row.user_id).filter(Boolean)).size;
  const corrected = records.filter((row) => row.metadata?.queryCorrected).length;
  const sessionCount = sessionsForPeriod.length;
  const faqEnd = sessionsForPeriod.filter((session) => session.faq_end_proxy).length;
  const handoff = sessionsForPeriod.filter((session) => session.explicit_handoff_observed).length;
  return {
    period_type: periodType,
    period_start_kst: periodStart,
    period_end_kst: periodEnd,
    brand,
    total_requests: total,
    matched_requests: matched,
    unmatched_requests: unmatched,
    match_rate_pct: pct(matched, total),
    unique_users: uniqueUsers,
    sessions: sessionCount,
    faq_end_proxy_sessions: faqEnd,
    faq_end_proxy_rate_pct: pct(faqEnd, sessionCount),
    explicit_handoff_observed_sessions: handoff,
    typo_corrected_requests: corrected,
    test_requests_excluded: true,
    metric_caveat: "FAQ 종료 추정은 실제 해결률·상담 억제율이 아님"
  };
}

const timeSeries = [];
for (const [type, keyFn, endFn] of [
  ["day", datePart, (key) => key],
  ["week", weekStart, (key) => addDays(key, 6)],
  ["month", monthPart, monthEnd]
]) {
  const periodKeys = [...new Set(productionRows.map((row) => keyFn(row.occurred_at)))].sort();
  for (const key of periodKeys) {
    const periodRecords = productionRows.filter((row) => keyFn(row.occurred_at) === key);
    const periodSessions = sessionRows.filter((session) => keyFn(session.session_start_kst) === key);
    for (const brand of ["ALL", ...new Set(periodRecords.map((row) => row.brand))]) {
      timeSeries.push(aggregate(
        brand === "ALL" ? periodRecords : periodRecords.filter((row) => row.brand === brand),
        brand === "ALL" ? periodSessions : periodSessions.filter((row) => row.brand === brand),
        type,
        key,
        endFn(key),
        brand
      ));
    }
  }
}

const brandSummary = [];
for (const brand of ["ALL", ...new Set(productionRows.map((row) => row.brand))]) {
  const brandRecords = brand === "ALL" ? productionRows : productionRows.filter((row) => row.brand === brand);
  const brandSessions = brand === "ALL" ? sessionRows : sessionRows.filter((row) => row.brand === brand);
  brandSummary.push(aggregate(brandRecords, brandSessions, "full_period", fullStart, fullEnd, brand));
}

const faqGroups = Map.groupBy(productionRows.filter((row) => row.matched && row.faq_id), (row) => `${row.brand}\u0000${row.faq_id}`);
const faqRanking = [...faqGroups.values()].map((group) => ({
  analysis_start_kst: fullStart,
  analysis_end_kst: fullEnd,
  brand: group[0].brand,
  faq_id: group[0].faq_id,
  faq_question: group[0].faq_question,
  category_name: group[0].category_name,
  hit_count: group.length,
  unique_users: new Set(group.map((row) => row.user_id).filter(Boolean)).size,
  avg_score: Number((group.reduce((sum, row) => sum + Number(row.score || 0), 0) / group.length).toFixed(1)),
  first_hit_kst: group[0].occurred_at,
  last_hit_kst: group.at(-1).occurred_at
})).sort((left, right) => right.hit_count - left.hit_count || left.brand.localeCompare(right.brand));

const unmatchedReplay = historicalUnmatched.map((row) => {
  const brand = getBrandConfig(row.brand);
  const match = brand ? findBestFaq(brand.data, row.sample_query) : null;
  return {
    source_period_start_kst: baselineStart,
    source_period_end_kst: baselineEnd,
    brand: row.brand,
    sample_query: row.sample_query,
    normalized_query_key: row.query_key,
    historical_occurrences: row.query_count,
    historical_unique_users: row.unique_user_count,
    historical_last_occurred_at_kst: row.last_occurred_at,
    current_handled: Boolean(match),
    current_faq_id: match?.faq.id || "",
    current_faq_question: match?.faq.question || "",
    current_score: match?.score || 0,
    current_action_type: match?.faq.id === "base-human-handoff" ? "human_handoff" : match ? "faq_or_clarification" : "unmatched"
  };
}).sort((left, right) => Number(right.current_handled) - Number(left.current_handled) || right.historical_occurrences - left.historical_occurrences);

const inventory = ["laurastar", "woods", "aarke", "litter-robot"].map((key) => {
  const brand = getBrandConfig(key);
  return {
    as_of_kst: generatedAt,
    brand: key,
    brand_name: brand.data.brand,
    categories: brand.data.categories.length,
    faqs: brand.data.flatFaqs.length,
    keywords: brand.data.flatFaqs.reduce((sum, faq) => sum + (faq.keywords?.length || 0), 0),
    dedicated_endpoint: `/skill/${key}/faq`,
    unified_endpoint: "/skill/faq"
  };
});

const baselineRows = productionRows.filter((row) => row.occurred_at >= baselineStart && row.occurred_at <= baselineEnd);
const baselineMatched = baselineRows.filter((row) => row.matched).length;
const replayHandledTypes = unmatchedReplay.filter((row) => row.current_handled).length;
const replayHandledOccurrences = unmatchedReplay.filter((row) => row.current_handled).reduce((sum, row) => sum + Number(row.historical_occurrences), 0);
const baselineUnmatchedOccurrences = historicalUnmatched.reduce((sum, row) => sum + Number(row.query_count), 0);
const projectedHandled = baselineMatched + replayHandledOccurrences;
const baselineDays = Math.floor((toUtcMs(`${datePart(baselineEnd)}T00:00:00.000`) - toUtcMs(`${datePart(baselineStart)}T00:00:00.000`)) / 86400000) + 1;
const avgDailyRequests = baselineRows.length / baselineDays;
const baselineMatchRate = pct(baselineMatched, baselineRows.length);
const replayProjectedRate = pct(projectedHandled, baselineRows.length);
const kpis = [
  ["운영 전체 요청", "count", productionRows.length, fullStart, fullEnd, "배포 검증 호출 제외"],
  ["운영 전체 매칭률", "percent", pct(productionRows.filter((row) => row.matched).length, productionRows.length), fullStart, fullEnd, "matched=true 비율"],
  ["분석 사용자", "count", new Set(userRows.map((row) => row.user_id)).size, fullStart, fullEnd, "사용자 ID 존재 기준"],
  ["30분 세션", "count", sessionRows.length, fullStart, fullEnd, "30분 비활동 시 신규 세션"],
  ["FAQ 내 종료 추정률", "percent", pct(sessionRows.filter((row) => row.faq_end_proxy).length, sessionRows.length), fullStart, fullEnd, "실제 해결률 또는 상담 억제율 아님"],
  ["명시적 상담사 연결 관측", "count", sessionRows.filter((row) => row.explicit_handoff_observed).length, fullStart, fullEnd, "외부 상담 클릭 이벤트 미수집"],
  ["과거 관측 매칭률", "percent", pct(baselineMatched, baselineRows.length), baselineStart, baselineEnd, "운영 DB 관측값"],
  ["과거 고유 미매칭 유형", "count", historicalUnmatched.length, baselineStart, baselineEnd, "정규화 질문 기준"],
  ["현재 처리 가능 전환 유형", "count", replayHandledTypes, baselineStart, baselineEnd, "현재 매처 재실행 결과"],
  ["고유 미매칭 유형 감소율", "percent", pct(replayHandledTypes, historicalUnmatched.length), baselineStart, baselineEnd, "재평가 추정"],
  ["예상 처리 가능률", "percent", pct(projectedHandled, baselineRows.length), baselineStart, baselineEnd, "동일 과거 데이터 재평가 추정"],
  ["FAQ 자산", "count", inventory.reduce((sum, row) => sum + row.faqs, 0), generatedAt, generatedAt, "정적 기준일"],
  ["등록 키워드", "count", inventory.reduce((sum, row) => sum + row.keywords, 0), generatedAt, generatedAt, "정적 기준일"],
  ["지원 브랜드", "count", inventory.length, generatedAt, generatedAt, "정적 기준일"]
].map(([metric, unit, value, start, end, note]) => ({ metric, unit, value, period_start_kst: start, period_end_kst: end, note }));

const visualizationData = timeSeries
  .filter((row) => row.brand === "ALL")
  .flatMap((row) => [
    { period_type: row.period_type, period_start_kst: row.period_start_kst, period_end_kst: row.period_end_kst, metric: "total_requests", value: row.total_requests, unit: "count" },
    { period_type: row.period_type, period_start_kst: row.period_start_kst, period_end_kst: row.period_end_kst, metric: "matched_requests", value: row.matched_requests, unit: "count" },
    { period_type: row.period_type, period_start_kst: row.period_start_kst, period_end_kst: row.period_end_kst, metric: "unmatched_requests", value: row.unmatched_requests, unit: "count" },
    { period_type: row.period_type, period_start_kst: row.period_start_kst, period_end_kst: row.period_end_kst, metric: "match_rate_pct", value: row.match_rate_pct, unit: "percent" },
    { period_type: row.period_type, period_start_kst: row.period_start_kst, period_end_kst: row.period_end_kst, metric: "faq_end_proxy_rate_pct", value: row.faq_end_proxy_rate_pct, unit: "percent" }
  ]);

const scenarios = [
  {
    scenario: "conservative",
    scenario_label: "보수",
    expected_match_rate_pct: Number((baselineMatchRate + (replayProjectedRate - baselineMatchRate) * 0.7).toFixed(1)),
    assumption: "재평가 개선 폭의 70%만 실제 운영에서 실현"
  },
  {
    scenario: "base",
    scenario_label: "기준",
    expected_match_rate_pct: replayProjectedRate,
    assumption: "과거 미매칭 재평가 결과가 실제 운영에서도 동일하게 유지"
  },
  {
    scenario: "target",
    scenario_label: "목표",
    expected_match_rate_pct: Math.max(90, replayProjectedRate),
    assumption: "잔여 미매칭 보강과 오탈자 사전 운영 개선 후 목표치"
  }
];

const forecast = [];
for (const weeks of [4, 8, 12]) {
  const days = weeks * 7;
  const projectedRequests = Math.round(avgDailyRequests * days);
  for (const scenario of scenarios) {
    const matchedRequests = Math.round(projectedRequests * scenario.expected_match_rate_pct / 100);
    forecast.push({
      forecast_as_of_kst: generatedAt,
      source_period_start_kst: baselineStart,
      source_period_end_kst: baselineEnd,
      horizon_weeks: weeks,
      forecast_period_start_kst: "2026-07-01",
      forecast_period_end_kst: addDays("2026-07-01", days - 1),
      scenario: scenario.scenario,
      scenario_label: scenario.scenario_label,
      baseline_days: baselineDays,
      baseline_requests: baselineRows.length,
      baseline_avg_daily_requests: Number(avgDailyRequests.toFixed(2)),
      baseline_match_rate_pct: baselineMatchRate,
      expected_match_rate_pct: scenario.expected_match_rate_pct,
      projected_total_requests: projectedRequests,
      projected_matched_requests: matchedRequests,
      projected_unmatched_requests: projectedRequests - matchedRequests,
      projected_match_gain_vs_baseline_count: matchedRequests - Math.round(projectedRequests * baselineMatchRate / 100),
      assumption: scenario.assumption,
      confidence_note: "통계 예측이 아닌 시나리오 계획값; 개선본 실제 표본 축적 후 재산출 필요"
    });
  }
}

const trendComparison = [
  {
    stage: "observed_baseline",
    stage_label: "개선 전 관측",
    metric: "match_rate_pct",
    value: baselineMatchRate,
    period_start_kst: baselineStart,
    period_end_kst: baselineEnd,
    data_type: "observed",
    note: "운영 DB 실제 관측"
  },
  {
    stage: "replay_projection",
    stage_label: "현재 매처 재평가",
    metric: "match_rate_pct",
    value: replayProjectedRate,
    period_start_kst: baselineStart,
    period_end_kst: baselineEnd,
    data_type: "historical_replay",
    note: "동일 과거 질문 재실행 추정"
  },
  ...scenarios.map((scenario) => ({
    stage: `future_${scenario.scenario}`,
    stage_label: `향후 12주 ${scenario.scenario_label}`,
    metric: "match_rate_pct",
    value: scenario.expected_match_rate_pct,
    period_start_kst: "2026-07-01",
    period_end_kst: addDays("2026-07-01", 83),
    data_type: "scenario",
    note: scenario.assumption
  }))
];

const observedMonthly = timeSeries
  .filter((row) => row.period_type === "month" && row.brand === "ALL")
  .map((row, index, monthlyRows) => {
    const previous = monthlyRows[index - 1];
    const periodStart = row.period_start_kst === "2026-05" ? datePart(fullStart) : `${row.period_start_kst}-01`;
    const periodEnd = row.period_start_kst === "2026-06" ? datePart(fullEnd) : row.period_end_kst;
    const observedDays = calendarDaysInclusive(periodStart, periodEnd);
    const dailyAverage = Number((row.total_requests / observedDays).toFixed(2));
    const previousPeriodStart = previous ? (previous.period_start_kst === "2026-05" ? datePart(fullStart) : `${previous.period_start_kst}-01`) : "";
    const previousPeriodEnd = previous ? (previous.period_start_kst === "2026-06" ? datePart(fullEnd) : previous.period_end_kst) : "";
    const previousDailyAverage = previous ? previous.total_requests / calendarDaysInclusive(previousPeriodStart, previousPeriodEnd) : 0;
    return {
      data_type: "observed",
      scenario: "actual",
      scenario_label: "관측",
      month: row.period_start_kst,
      period_start_kst: periodStart,
      period_end_kst: periodEnd,
      period_completeness: row.period_start_kst === "2026-05" ? "partial_start_month" : row.period_start_kst === "2026-06" ? "partial_through_extract_time" : "complete_month",
      observed_or_forecast_days: observedDays,
      total_requests: row.total_requests,
      avg_daily_requests: dailyAverage,
      matched_requests: row.matched_requests,
      unmatched_requests: row.unmatched_requests,
      match_rate_pct: row.match_rate_pct,
      request_change_vs_previous: previous ? row.total_requests - previous.total_requests : "",
      request_change_pct_vs_previous: previous ? pct(row.total_requests - previous.total_requests, previous.total_requests) : "",
      avg_daily_request_change_pct_vs_previous: previous ? Number((((dailyAverage - previousDailyAverage) / previousDailyAverage) * 100).toFixed(1)) : "",
      match_rate_change_pp_vs_previous: previous ? Number((row.match_rate_pct - previous.match_rate_pct).toFixed(1)) : "",
      source_period_start_kst: fullStart,
      source_period_end_kst: fullEnd,
      assumption: "운영 관측값; 배포 검증 호출 제외",
      confidence_note: "5월과 6월은 모두 완전한 월 비교가 아니므로 전월 증감 해석 주의"
    };
  });

const forecastMonths = [
  { month: "2026-07", start: "2026-07-01", end: "2026-07-31", days: 31 },
  { month: "2026-08", start: "2026-08-01", end: "2026-08-31", days: 31 },
  { month: "2026-09", start: "2026-09-01", end: "2026-09-30", days: 30 }
];
const monthlyForecast = [];
for (const scenario of scenarios) {
  let previousRequests = observedMonthly.at(-1)?.total_requests || 0;
  let previousRate = observedMonthly.at(-1)?.match_rate_pct || 0;
  let previousDailyRequests = observedMonthly.at(-1)?.avg_daily_requests || 0;
  for (const month of forecastMonths) {
    const totalRequests = Math.round(avgDailyRequests * month.days);
    const monthlyDailyRequests = Number((totalRequests / month.days).toFixed(2));
    const matchedRequests = Math.round(totalRequests * scenario.expected_match_rate_pct / 100);
    monthlyForecast.push({
      data_type: "scenario",
      scenario: scenario.scenario,
      scenario_label: scenario.scenario_label,
      month: month.month,
      period_start_kst: month.start,
      period_end_kst: month.end,
      period_completeness: "forecast_full_month",
      observed_or_forecast_days: month.days,
      total_requests: totalRequests,
      avg_daily_requests: monthlyDailyRequests,
      matched_requests: matchedRequests,
      unmatched_requests: totalRequests - matchedRequests,
      match_rate_pct: scenario.expected_match_rate_pct,
      request_change_vs_previous: totalRequests - previousRequests,
      request_change_pct_vs_previous: pct(totalRequests - previousRequests, previousRequests),
      avg_daily_request_change_pct_vs_previous: previousDailyRequests ? Number((((monthlyDailyRequests - previousDailyRequests) / previousDailyRequests) * 100).toFixed(1)) : "",
      match_rate_change_pp_vs_previous: Number((scenario.expected_match_rate_pct - previousRate).toFixed(1)),
      source_period_start_kst: baselineStart,
      source_period_end_kst: baselineEnd,
      assumption: scenario.assumption,
      confidence_note: "통계 예측이 아닌 시나리오 계획값; 실제 월별 데이터 축적 후 갱신 필요"
    });
    previousRequests = totalRequests;
    previousRate = scenario.expected_match_rate_pct;
    previousDailyRequests = monthlyDailyRequests;
  }
}

const monthlyBrandRows = [];
const analysisBrands = ["laurastar", "woods", "aarke", "litter-robot"];
for (const brand of analysisBrands) {
  const brandObservedMonths = ["2026-05", "2026-06"].map((month, index, months) => {
    const monthRecords = productionRows.filter((row) => row.brand === brand && monthPart(row.occurred_at) === month);
    const periodStart = month === "2026-05" ? datePart(fullStart) : `${month}-01`;
    const periodEnd = month === "2026-06" ? datePart(fullEnd) : monthEnd(month);
    const days = calendarDaysInclusive(periodStart, periodEnd);
    const matched = monthRecords.filter((row) => row.matched).length;
    const previousMonth = months[index - 1];
    const previousRecords = previousMonth ? productionRows.filter((row) => row.brand === brand && monthPart(row.occurred_at) === previousMonth) : [];
    const previousStart = previousMonth === "2026-05" ? datePart(fullStart) : previousMonth ? `${previousMonth}-01` : "";
    const previousEnd = previousMonth === "2026-06" ? datePart(fullEnd) : previousMonth ? monthEnd(previousMonth) : "";
    const previousDaily = previousMonth ? previousRecords.length / calendarDaysInclusive(previousStart, previousEnd) : 0;
    const daily = monthRecords.length / days;
    return {
      brand,
      data_type: "observed",
      scenario: "actual",
      scenario_label: "관측",
      month,
      period_start_kst: periodStart,
      period_end_kst: periodEnd,
      period_completeness: month === "2026-05" ? "partial_start_month" : "partial_through_extract_time",
      observed_or_forecast_days: days,
      total_requests: monthRecords.length,
      avg_daily_requests: Number(daily.toFixed(2)),
      matched_requests: matched,
      unmatched_requests: monthRecords.length - matched,
      match_rate_pct: pct(matched, monthRecords.length),
      request_change_vs_previous: previousMonth ? monthRecords.length - previousRecords.length : "",
      avg_daily_request_change_pct_vs_previous: previousMonth && previousDaily ? Number((((daily - previousDaily) / previousDaily) * 100).toFixed(1)) : "",
      match_rate_change_pp_vs_previous: previousMonth ? Number((pct(matched, monthRecords.length) - pct(previousRecords.filter((row) => row.matched).length, previousRecords.length)).toFixed(1)) : "",
      source_period_start_kst: fullStart,
      source_period_end_kst: fullEnd,
      assumption: "운영 관측값; 배포 검증 호출 제외",
      confidence_note: "5월과 6월은 부분월 비교"
    };
  });
  monthlyBrandRows.push(...brandObservedMonths);

  const brandBaseline = baselineRows.filter((row) => row.brand === brand);
  const brandBaselineMatched = brandBaseline.filter((row) => row.matched).length;
  const replayForBrand = unmatchedReplay.filter((row) => row.brand === brand && row.current_handled);
  const recoveredOccurrences = replayForBrand.reduce((sum, row) => sum + Number(row.historical_occurrences), 0);
  const brandBaselineRate = pct(brandBaselineMatched, brandBaseline.length);
  const brandProjectedRate = pct(brandBaselineMatched + recoveredOccurrences, brandBaseline.length);
  const brandDailyVolume = brandBaseline.length / baselineDays;
  const hasBaseline = brandBaseline.length > 0;
  const brandScenarios = hasBaseline ? [
    { scenario: "conservative", label: "보수", rate: Number((brandBaselineRate + (brandProjectedRate - brandBaselineRate) * 0.7).toFixed(1)), assumption: "브랜드 재평가 개선 폭의 70% 실현" },
    { scenario: "base", label: "기준", rate: brandProjectedRate, assumption: "브랜드 과거 미매칭 재평가 결과 유지" },
    { scenario: "target", label: "목표", rate: Math.max(90, brandProjectedRate), assumption: "잔여 미매칭 보강 후 목표치" }
  ] : [
    { scenario: "insufficient_data", label: "예측 불가", rate: "", assumption: "개선 전 기준 기간 운영 이력 없음" }
  ];

  for (const scenario of brandScenarios) {
    let previousDaily = brandObservedMonths.at(-1).avg_daily_requests;
    let previousRate = brandObservedMonths.at(-1).match_rate_pct;
    for (const month of forecastMonths) {
      const total = hasBaseline ? Math.round(brandDailyVolume * month.days) : 0;
      const matched = hasBaseline ? Math.round(total * scenario.rate / 100) : 0;
      const daily = Number((total / month.days).toFixed(2));
      monthlyBrandRows.push({
        brand,
        data_type: "scenario",
        scenario: scenario.scenario,
        scenario_label: scenario.label,
        month: month.month,
        period_start_kst: month.start,
        period_end_kst: month.end,
        period_completeness: "forecast_full_month",
        observed_or_forecast_days: month.days,
        total_requests: total,
        avg_daily_requests: daily,
        matched_requests: matched,
        unmatched_requests: total - matched,
        match_rate_pct: scenario.rate,
        request_change_vs_previous: "",
        avg_daily_request_change_pct_vs_previous: previousDaily ? Number((((daily - previousDaily) / previousDaily) * 100).toFixed(1)) : "",
        match_rate_change_pp_vs_previous: scenario.rate === "" ? "" : Number((scenario.rate - previousRate).toFixed(1)),
        source_period_start_kst: baselineStart,
        source_period_end_kst: baselineEnd,
        assumption: scenario.assumption,
        confidence_note: hasBaseline ? "통계 예측이 아닌 브랜드별 시나리오 계획값" : "실제 운영 데이터 축적 후 산출 필요"
      });
      previousDaily = daily;
      if (scenario.rate !== "") previousRate = scenario.rate;
    }
  }
}

function observedWeeklyRows(brand = "ALL") {
  const sourceRows = timeSeries.filter((row) => row.period_type === "week" && row.brand === brand);
  return sourceRows.map((row, index) => {
    const previous = sourceRows[index - 1];
    const start = row.period_start_kst < datePart(fullStart) ? datePart(fullStart) : row.period_start_kst;
    const end = row.period_end_kst > datePart(fullEnd) ? datePart(fullEnd) : row.period_end_kst;
    const days = calendarDaysInclusive(start, end);
    const daily = row.total_requests / days;
    let previousDaily = 0;
    if (previous) {
      const previousStart = previous.period_start_kst < datePart(fullStart) ? datePart(fullStart) : previous.period_start_kst;
      const previousEnd = previous.period_end_kst > datePart(fullEnd) ? datePart(fullEnd) : previous.period_end_kst;
      previousDaily = previous.total_requests / calendarDaysInclusive(previousStart, previousEnd);
    }
    return {
      brand,
      data_type: "observed",
      scenario: "actual",
      scenario_label: "관측",
      week_start_kst: row.period_start_kst,
      week_end_kst: row.period_end_kst,
      observed_start_kst: start,
      observed_end_kst: end,
      period_completeness: days === 7 ? "complete_week" : "partial_week",
      observed_or_forecast_days: days,
      total_requests: row.total_requests,
      avg_daily_requests: Number(daily.toFixed(2)),
      matched_requests: row.matched_requests,
      unmatched_requests: row.unmatched_requests,
      match_rate_pct: row.match_rate_pct,
      request_change_vs_previous: previous ? row.total_requests - previous.total_requests : "",
      avg_daily_request_change_pct_vs_previous: previous && previousDaily ? Number((((daily - previousDaily) / previousDaily) * 100).toFixed(1)) : "",
      match_rate_change_pp_vs_previous: previous ? Number((row.match_rate_pct - previous.match_rate_pct).toFixed(1)) : "",
      source_period_start_kst: fullStart,
      source_period_end_kst: fullEnd,
      assumption: "운영 관측값; 배포 검증 호출 제외",
      confidence_note: days === 7 ? "완전 주차" : "부분 주차이므로 총량 비교 시 일평균 사용"
    };
  });
}

function weeklyForecastRows(brand = "ALL") {
  const brandBaseline = brand === "ALL" ? baselineRows : baselineRows.filter((row) => row.brand === brand);
  const baselineMatched = brandBaseline.filter((row) => row.matched).length;
  const recovered = unmatchedReplay
    .filter((row) => row.current_handled && (brand === "ALL" || row.brand === brand))
    .reduce((sum, row) => sum + Number(row.historical_occurrences), 0);
  const baselineRate = pct(baselineMatched, brandBaseline.length);
  const projectedRate = pct(baselineMatched + recovered, brandBaseline.length);
  const dailyVolume = brandBaseline.length / baselineDays;
  const hasBaseline = brandBaseline.length > 0;
  const forecastScenarios = hasBaseline ? [
    { scenario: "conservative", label: "보수", rate: Number((baselineRate + (projectedRate - baselineRate) * 0.7).toFixed(1)), assumption: "재평가 개선 폭의 70% 실현" },
    { scenario: "base", label: "기준", rate: projectedRate, assumption: "과거 미매칭 재평가 결과 유지" },
    { scenario: "target", label: "목표", rate: Math.max(90, projectedRate), assumption: "잔여 미매칭 보강 후 목표치" }
  ] : [
    { scenario: "insufficient_data", label: "예측 불가", rate: "", assumption: "개선 전 기준 기간 운영 이력 없음" }
  ];
  const result = [];
  for (const scenario of forecastScenarios) {
    let previousDaily = observedWeeklyRows(brand).at(-1)?.avg_daily_requests || 0;
    let previousRate = observedWeeklyRows(brand).at(-1)?.match_rate_pct || 0;
    for (let index = 0; index < 12; index += 1) {
      const start = addDays("2026-07-06", index * 7);
      const end = addDays(start, 6);
      const total = hasBaseline ? Math.round(dailyVolume * 7) : 0;
      const matched = hasBaseline ? Math.round(total * scenario.rate / 100) : 0;
      const daily = Number((total / 7).toFixed(2));
      result.push({
        brand,
        data_type: "scenario",
        scenario: scenario.scenario,
        scenario_label: scenario.label,
        week_start_kst: start,
        week_end_kst: end,
        observed_start_kst: start,
        observed_end_kst: end,
        period_completeness: "forecast_complete_week",
        observed_or_forecast_days: 7,
        total_requests: total,
        avg_daily_requests: daily,
        matched_requests: matched,
        unmatched_requests: total - matched,
        match_rate_pct: scenario.rate,
        request_change_vs_previous: "",
        avg_daily_request_change_pct_vs_previous: previousDaily ? Number((((daily - previousDaily) / previousDaily) * 100).toFixed(1)) : "",
        match_rate_change_pp_vs_previous: scenario.rate === "" ? "" : Number((scenario.rate - previousRate).toFixed(1)),
        source_period_start_kst: baselineStart,
        source_period_end_kst: baselineEnd,
        assumption: scenario.assumption,
        confidence_note: hasBaseline ? "통계 예측이 아닌 주별 시나리오 계획값" : "실제 운영 데이터 축적 후 산출 필요"
      });
      previousDaily = daily;
      if (scenario.rate !== "") previousRate = scenario.rate;
    }
  }
  return result;
}

const weeklyAll = [...observedWeeklyRows("ALL"), ...weeklyForecastRows("ALL")];
const weeklyBrands = analysisBrands.flatMap((brand) => [
  ...observedWeeklyRows(brand),
  ...weeklyForecastRows(brand)
]);

writeCsv("00_kpi_summary.csv", kpis);
writeCsv("01_history_raw.csv", rawRows);
writeCsv("02_time_series_day_week_month.csv", timeSeries);
writeCsv("03_brand_summary.csv", brandSummary);
writeCsv("04_session_detail_30min.csv", sessionRows);
writeCsv("05_faq_ranking.csv", faqRanking);
writeCsv("06_historical_unmatched_replay.csv", unmatchedReplay);
writeCsv("07_faq_inventory.csv", inventory);
writeCsv("08_visualization_long_format.csv", visualizationData);
writeCsv("09_forecast_scenarios_4_8_12_weeks.csv", forecast);
writeCsv("10_change_and_future_chart_data.csv", trendComparison);
writeCsv("11_monthly_change_and_forecast.csv", [...observedMonthly, ...monthlyForecast]);
writeCsv("12_monthly_brand_change_and_forecast.csv", monthlyBrandRows);
writeCsv("13_weekly_change_and_forecast.csv", weeklyAll);
writeCsv("14_weekly_brand_change_and_forecast.csv", weeklyBrands);

const manifest = {
  generated_at_kst: generatedAt,
  source_rows: rows.length,
  production_or_unknown_rows: productionRows.length,
  deployment_test_rows: classifiedRows.filter((row) => row.record_class === "deployment_test").length,
  full_period_start_kst: fullStart,
  full_period_end_kst: fullEnd,
  baseline_period_start_kst: baselineStart,
  baseline_period_end_kst: baselineEnd,
  files: fs.readdirSync(outputDir).filter((file) => file.endsWith(".csv")).sort()
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
