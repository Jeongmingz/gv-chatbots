# Production FAQ History Audit (2026-06-29)

## Data Set

- Source: production Supabase `faq_history` and `faq_history_unmatched_queries`
- Period: 2026-05-20 22:17:36 through 2026-06-28 20:06:43 (KST values stored without timezone)
- History rows: 262
- Stored matched rows: 164
- Stored unmatched rows: 98
- Distinct normalized unmatched questions: 87
- Brands present: Laurastar, Woods, Aarke
- Litter-Robot has no production history rows in this data set.

The 87 stored unmatched questions were replayed against the matcher after applying the completed matching worksheet. Sixty-one now receive an FAQ, clarification, acknowledgement, or human-handoff response. Twenty-six remain unmatched. The remaining set includes messages that still lack enough product or symptom information and topics not covered by the current corpus.

## Representative Fixes In Current Local Changes

| Brand | Production question | Current result | Assessment |
|---|---|---|---|
| Aarke | `가스리필 신청합니다.` | `aarke-refill-cylinder-purchase` | correct |
| Laurastar | `안녕하세요` | `base-greeting` | correct |
| Woods | `안녕하세요` | `base-greeting` | correct |
| Laurastar | `As신청 어떻게 하나요` | `as-before-check` | acceptable but a dedicated AS application intent is preferable |
| Woods | `제습기 제품등록을 하려고 하는데 주소창에 주소를 입력할수 없습니다` | `woods-product-registration` | correct |
| Woods | `필터 청소` | Woods filter management | correct |
| Laurastar | `분당 AK 백화점 팝업 계획이 있을까요?` | offline store | weak, needs pop-up/store utterances |
| Laurastar | `물샘증상` | `as-no-defect-return` | incorrect; this is a false positive |

## High-Priority Unmatched Questions

These are clear support or FAQ intents and should be added to the regression corpus before matcher changes.

### Laurastar

| Production question | Intended intent or action |
|---|---|
| `매장 좀 알려줘` | offline store location |
| `롯데 본점에도 매장이 있어?` | offline store location |
| `수돗물`, `수돗물요` | water type; clarify model only if the answer differs |
| `물을 다시 다 뺏다 넣어도 보고... 계속 물부족불 들어온다네요` | water warning / water not entering |
| `필터를 빼고 해도 왼쪽 쪽 빨간 불이 계속 빤짝거리면서 물이 투입이 안 됩니다` | water warning / water not entering |
| `물 표시가 빨갛게 계속 깜빡입니다` | water warning; model clarification may be required |
| `스팀이 안나오다가 ... 전원을 켰는데 깜박거리기만합니다` | no steam / warning light / AS escalation |
| `스팀은안나오고 열만 되요` | no steam |
| `As어떻게 합니까`, `as진행하고 싶습니다`, `as 관련문의` | AS application |
| `필터 사용기한` | filter replacement interval |
| `필터 교체해도 알람이 깜박이고 스팀이 나오지않아요` | filter alarm plus no steam, not simple filter replacement |
| `다리미판 분리방법 동영상` | board disassembly guide |
| `어제 배송 받았는데 부품이 하나 없습니다` | missing component / delivery issue |
| `나사가 안왔어요` | missing component / delivery issue |
| `다리미판은 따로 배송 되나요?` | separate component delivery |
| `물통분실구매` | replacement part purchase |
| `다리미판커버 어디서 구입가능한가요?` | cover purchase, not compatibility only |
| `사용중 누전이 됐어요` | electrical safety; stop use and escalate |
| `팬이 돌다가 멈춰요` | board fan stops |
| `스팀으로 다림질했는데 원단이 쪼그라들었어요` | fabric damage / usage safety |
| `제품사용중인데 최근들어 다림질이 거의 안되서 연락드려요` | performance degradation; needs model/symptom clarification |
| `솔플레이트를 써야하는 이유` | soleplate purpose |
| `실크도 가능한가요?` | fabric compatibility |
| `석회 차단되는건가요?` | anti-scale/filter function |

### Woods

| Production question | Intended intent or action |
|---|---|
| `물도없는데 램프색이 빨간색으로 뜨는데요 ... 첫 사용이예요` | tank-empty warning / red light |
| `30평대 ... 작동되다가 수시로 꺼지던데 왜그런가요?` | intermittent power-off |
| `제습기 회수도 늦고 ... 진행이 느린지?` | AS status inquiry; should escalate rather than answer packing FAQ |
| `필터 교체` | filter replacement |
| `습도 확인`, `습도 측정` | humidity display/sensor behavior |
| `42 맥스기능?` | SW42FW Max mode/function |

### Aarke

| Production question | Intended intent or action |
|---|---|
| `구입했는데 장품등록을 어떻게 하나오` | product registration with typo tolerance |
| `추가 제품 구입은 어디서` | purchase clarification; currently misrouted to product registration |
| `가스 주입 후 받침 아래에 물이 고여있던데 정상인가요` | water leak/pooling after carbonation; currently misrouted |
| `3를구매했는데 ... 실린더를 벌써 다쓸수도 있나요?` | cylinder capacity or empty check; currently refill purchase |

## Confirmed False Positives In Stored Matches

Low-score stored matches expose cases where the bot answered instead of admitting ambiguity.

| Brand | Question | Stored FAQ | Assessment |
|---|---|---|---|
| Laurastar | `빨간선까지 당기지 않았는데 ... 코드가 안들어갑니다` | Smart water not moving | wrong; cord lock/retraction issue |
| Laurastar | `코드 선이 자동으로 들어가지 않아요` | Smart water not moving | wrong; cord lock/retraction issue |
| Laurastar | `필터를 새걸로 교환 하고 해도 안 됩니다` | model exchange | wrong; replacement verb caused intent collision |
| Woods | `제습기 교환 문의 드려요` | low-temperature dehumidifier definition | wrong |
| Woods | group-purchase partnership request | low-temperature dehumidifier definition | wrong; should route to 상담/partnership |
| Woods | Kakao image/video URLs | usage mode comparison | wrong; attachments must not enter FAQ scoring |
| Aarke | `가스 주입 후 받침 아래에 물이 고여있던데 정상인가요` | gas button no response | wrong |
| Aarke | `3를구매했는데 ... 실린더를 벌써 다쓸수도 있나요?` | refill cylinder purchase | wrong |

## Messages That Should Not Be FAQ-Matched

The production unmatched set also contains conversational or operational messages:

- Empty input and punctuation-only input
- `감사합니다`, `고마워`, `넵`, weekend greetings
- Payment confirmations and depositor names
- Order-number-only inquiries
- Image/video URLs and messages saying an attachment was sent
- `문의`, `질문`, `FAQ`, `제품문의 상담` without a concrete intent
- Requests for a human response, AS progress, partnerships, or order-specific handling

These need a separate conversation router with `greeting`, `thanks`, `attachment`, `order_specific`, `as_status`, `partnership`, `human_handoff`, and `insufficient_detail` outcomes. They should not be solved by adding FAQ keywords.

## Production-Driven Priorities

1. Add a pre-router for non-FAQ messages and human-handoff intents.
2. Add explicit AS application and AS status intents; do not reuse generic AS FAQ keywords.
3. Add typo/spacing normalization for `장품등록`, joined Korean words, and common inflections.
4. Separate object and action: `filter + replace`, `filter + alarm`, `cylinder + purchase`, `cylinder + empty`, `part + purchase`.
5. Add negative intent evidence so `교환` in `필터를 교환` cannot trigger product exchange.
6. Reject attachments before FAQ scoring.
7. Ask a model or symptom clarification when the query only says `red light`, `water`, `steam`, or `power`.
8. Add every high-priority question above as a regression case using anonymized text.

## Measurement Caveat

Historical `matched=true` does not mean the answer was correct. The database stores matcher acceptance, not customer confirmation. Quality reporting should therefore add `top_score`, `second_score`, `score_margin`, response action, and optional user feedback fields. Low-margin accepted matches should be reviewed alongside `matched=false` rows.
