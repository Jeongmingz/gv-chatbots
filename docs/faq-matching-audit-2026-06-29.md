# FAQ Matching Audit (2026-06-29)

## Scope

- Brands: Laurastar, Woods, Aarke, Litter-Robot
- FAQ records: 190
- Registered keywords: 2,046
- Matcher: `src/faq.js` (`findBestFaq`, `searchFaq`)
- Checks: exact question replay, keyword ownership/collision, keyword replay, duplicate questions, and 40 natural customer utterances

## Executive Summary

The current matcher is reliable for exact FAQ questions, but it is not reliable enough for short customer language. The issue is structural rather than isolated missing keywords.

1. FAQ records do not define explicit intents or representative utterances.
2. Generic nouns such as product names, parts, colors, `AS`, and `manual` are copied across many FAQs.
3. Every registered keyword is tokenized again, so short or joined Korean phrases can score zero even though they exist in the data.
4. Brand-specific synonym rules are global and can promote the wrong FAQ.
5. Ambiguous matches are dropped when the score margin is below 8, producing a fallback instead of a clarifying question.

Adding more keywords alone will continue to create collisions. The recommended change is an intent-first matching layer with explicit utterances and structured entities.

## Inventory And Static Results

| Brand | FAQs | Keywords | Shared keyword values | Unique keywords not reaching owner | Duplicate questions |
|---|---:|---:|---:|---:|---:|
| Laurastar | 55 | 335 | 50 | 40 | 0 |
| Woods | 34 | 451 | 1 | 104 | 0 |
| Aarke | 44 | 380 | 54 | 80 | 0 |
| Litter-Robot | 57 | 880 | 65 | 2 | 2 |
| Total | 190 | 2,046 | 170 | 226 | 2 |

`Unique keywords not reaching owner` is a diagnostic count. It includes weak one-word keywords that may intentionally be insufficient alone, but it proves that `keywords` currently cannot be treated as guaranteed match phrases.

All Laurastar, Woods, and Aarke exact question replays matched their own FAQ. Litter-Robot had two exact-question collisions caused by duplicate records.

## Natural Utterance Results

| Brand | Passed | Total | Rate |
|---|---:|---:|---:|
| Laurastar | 9 | 10 | 90% |
| Woods | 8 | 10 | 80% |
| Aarke | 7 | 10 | 70% |
| Litter-Robot | 5 | 10 | 50% |
| Total | 29 | 40 | 72.5% |

Representative failures:

| Brand | Utterance | Expected | Current result |
|---|---|---|---|
| Laurastar | `생수 써도 돼` | `common-water-type` | no match |
| Woods | `제습기에서 물이 샙니다` | `woods-제품에서-물이-새요` | wrong FAQ / tie |
| Woods | `배수호스 연결하는법` | drain hose connection | no match / margin 2 |
| Aarke | `탄산수 만드는법` | `aarke-how-to-use` | no match |
| Aarke | `카보네이터 프로 사용법` | Pro usage | general Aarke usage |
| Aarke | `물이 뿜어져요` | water splashing | no match / tie |
| Litter-Robot | `아기고양이도 써도돼` | kitten usage | no match |
| Litter-Robot | `고양이 몇키로까지` | weight limit | no match |
| Litter-Robot | `체중이 자꾸 다르게 나와` | intermittent weight | no match / margin 4 |
| Litter-Robot | `호퍼 모래 자동공급 안돼` | hopper feed failure | no match / tie |
| Litter-Robot | `파란불 다섯칸 깜빡여` | blue five lights | no match |

## Brand Findings

### Laurastar

- Product-family words (`Lift`, `IZZI`, `IGGI`, `Smart`) are reused across many records.
- `AS`, `filter`, `boiler`, and `board` are broad topic words, not intent identifiers.
- Joined colloquial phrases such as `몇분`, `뚝뚝`, and `생수` can score zero.
- Model comparison and model-specific operation records compete unless both model and action are explicit.

Priority intent groups: water type, model comparison, filter purchase/replacement, cap issue, AS pickup/packing, return/exchange.

### Woods

- The source has many unique phrases, but 104 unique keyword phrases still fail to reach their owner.
- Inflected phrases such as `전원이 안켜져요`, `덜덜 떨려요`, and `연결하는법` are poorly normalized.
- Model-specific answers are selected after matching, so the first-stage intent must be stable before model selection.
- AS packing, box shipment, and pickup are three close intents sharing operational nouns.

Priority intent groups: no power, noise/vibration, water leak, tank warning, continuous drain, hose connection/purchase, filter type/cleaning/replacement/purchase.

### Aarke

- Cylinder records share `cylinder`, `refill`, `replacement`, `collection`, and `purchase`, causing short-query ties.
- Bottle compatibility, bottle cleaning, and product usage compete on generic terms.
- Global synonym expansion for `사용법` adds tokens for the generic Aarke usage FAQ and can override `Carbonator Pro` usage.
- Symptom pairs such as loud sound/no sound, weak carbonation/no carbonation, and splash/leak require explicit polarity and symptom entities.

Priority intent groups: device usage by model, bottle compatibility/cleaning, cylinder status/replacement/refill purchase/return, carbonation strength, sound polarity, splash versus leak.

### Litter-Robot

- This corpus needs data cleanup before matcher tuning.
- Many records contain the same broad keyword bundle, including `manual`, `error`, `light bar`, `blinking`, and `cleaning`.
- Light errors need structured entities: primary color, primary count, primary state, secondary color, secondary count, secondary state, and speed.
- Korean color/count variants (`파란불`, `파란색`, `다섯칸`, `5칸`) are not normalized.
- Two question pairs are exact duplicates but have different answers:
  - `고양이 몸무게가 제대로 측정되지 않아요`
  - `파란색 3칸 고정 + 노란색 2칸 깜빡`
- The duplicate light pattern is especially unsafe because one answer says excess weight and the other says uneven installation.

Priority intent groups: Wi-Fi connection, kitten/weight rules, weight unit versus inaccurate measurement, litter type, hopper installation/feed/motor fault, drawer-full sensor, structured light patterns, parts purchase.

## Recommended Data Model

Keep categories for navigation, but do not use category subdivision as the primary matching solution.

```json
{
  "id": "aarke-refill-cylinder-purchase",
  "intent": "cylinder.refill_purchase",
  "utterances": [
    "가스리필 신청합니다",
    "리필 실린더 주문할게요",
    "충전 실린더 어디서 사요"
  ],
  "entities": {
    "object": ["실린더", "가스", "co2"],
    "action": ["신청", "구매", "주문"]
  },
  "negative_entities": {
    "action": ["교체", "반납", "확인"]
  }
}
```

For Litter-Robot light errors, use structured matching rather than a flat keyword list:

```json
{
  "intent": "light_error",
  "pattern": {
    "primary_color": "blue",
    "primary_count": 3,
    "primary_state": "solid",
    "secondary_color": "yellow",
    "secondary_count": 2,
    "secondary_state": "blinking"
  }
}
```

## Recommended Matcher Order

1. Exact normalized `utterances` match.
2. Structured entity/pattern match for model, part, action, symptom, polarity, color, count, and state.
3. Intent token score using brand-local synonyms.
4. Legacy question/keyword score as a compatibility fallback.
5. Clarifying response when two intents remain close; do not silently choose or fall back to a generic FAQ list.

## Implementation Order

1. Remove or merge the two Litter-Robot duplicate question pairs after confirming the intended answers.
2. Add matcher support for `intent`, `utterances`, `entities`, and `negative_entities` while preserving current JSON compatibility.
3. Move brand-specific synonym rules out of the global list.
4. Migrate Aarke cylinder and Litter-Robot light-error groups first because they have the highest ambiguity risk.
5. Migrate Woods action groups and Laurastar product-family groups.
6. Build a regression corpus with at least 5 natural utterances per FAQ: 950 utterances for 190 FAQs.
7. Record unmatched and low-margin production queries so the corpus can be improved from real customer language.
