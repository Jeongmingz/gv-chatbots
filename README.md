# Laurastar Kakao Chatbot Worker

로라스타 FAQ 응답용 카카오 챗봇 스킬입니다. Cloudflare Workers 배포를 기본으로 사용합니다.

## 로컬 실행

```bash
npm run worker:dev
```

기본 개발 주소는 Wrangler가 출력하는 로컬 주소를 사용하면 됩니다.

Node 로컬 서버로도 테스트할 수 있습니다.

```bash
npm start
```

## Cloudflare Workers 배포

```bash
npm run worker:deploy
```

최초 실행 시 Cloudflare 로그인이 필요하면 Wrangler 안내에 따라 로그인하면 됩니다.

카카오 챗봇 관리자센터 스킬 URL에는 아래 형식으로 등록합니다.

```txt
https://배포된-worker-도메인/skill/faq
https://배포된-worker-도메인/skill/laurastar/faq
https://배포된-worker-도메인/skill/woods/faq
```

## FAQ 히스토리 저장

카카오 챗봇 스킬 요청은 쿼리파라미터가 아니라 `POST` JSON body로 들어옵니다. 이 서버는
`userRequest.utterance`, `action.detailParams.utterance`, `action.params` 순서로 실제 질문을
추출하고, 답변 매칭 결과를 `faq_history` 테이블에 저장합니다.

Supabase SQL editor 또는 self-hosting DB 콘솔에서 아래 SQL 파일을 한 번 실행해 테이블을 생성합니다.

```txt
sql/faq_history.sql
```

히스토리 시간 컬럼은 대한민국 기준으로 저장합니다. `occurred_at`, `inserted_at`은
`timestamp without time zone` 타입이며, Worker가 `Asia/Seoul` 기준 시각을 넣습니다. 기존
`timestamptz` 테이블에 다시 실행하면 기존 UTC 값도 한국시간으로 한 번 변환됩니다.

Cloudflare Worker에는 Supabase 값을 secret으로 등록합니다.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

테이블명을 바꾸는 경우에만 `SUPABASE_HISTORY_TABLE` 환경변수를 추가합니다. 기본값은
`faq_history`입니다. 로컬 Node 서버는 같은 환경변수가 있으면 Supabase에 저장하고, 없으면
`logs/faq-history.ndjson`에 저장합니다.

공통 스킬 엔드포인트(`/skill/faq`)는 사용자가 선택한 브랜드를 `userRequest.user.id` 기준으로
기억합니다. `sql/faq_history.sql`에는 `faq_brand_sessions` 테이블도 포함되어 있으므로 배포 전
SQL을 다시 실행해야 합니다. 세션 테이블명을 바꾸는 경우에만 `SUPABASE_BRAND_SESSION_TABLE`
환경변수를 추가합니다. 기본값은 `faq_brand_sessions`입니다.

배포 후 `/health` 응답의 `history` 값을 확인합니다.

```json
{
  "history": {
    "configured": true,
    "sink": "supabase",
    "missingSecrets": []
  }
}
```

Cloudflare 로그에 `faq_history_config_missing`가 보이면 Worker에 Supabase secret이 없는
상태라서 DB 저장 대신 콘솔 로그만 남깁니다. `faq_history_saved`가 보이면 Supabase insert가
완료된 상태입니다.

`new row violates row-level security policy for table "faq_history"` 오류가 보이면 아래 중
하나입니다.

- `SUPABASE_SERVICE_ROLE_KEY`에 service role key가 아니라 anon key가 등록되어 있음
- `sql/faq_history.sql`의 insert policy가 Supabase DB에 아직 반영되지 않음

anon key로 저장하는 경우에도 동작하도록 `sql/faq_history.sql`에는 `faq_history_insert`
insert-only RLS policy가 포함되어 있습니다. 이 SQL을 다시 실행한 뒤 재요청하면 됩니다.

## 엔드포인트

- `GET /health`: 서버/FAQ 데이터 상태 확인
- `GET /faq/categories`: FAQ 카테고리 목록 확인
- `GET /faq/search?q=질문`: 로컬 검색 테스트
- `GET /faq/guide`: 카카오 카드/바로가기 응답 샘플
- `POST /skill/faq`: 브랜드 선택 후 FAQ를 답변하는 공통 카카오 챗봇 스킬 엔드포인트
- `POST /skill/laurastar/faq`: 카카오 챗봇 스킬 연동 엔드포인트
- `POST /skill/woods/faq`: 우즈 카카오 챗봇 스킬 연동 엔드포인트

## 카카오 스킬 요청 예시

```bash
curl -s -X POST http://localhost:3000/skill/faq \
  -H 'content-type: application/json' \
  -d '{"userRequest":{"utterance":"스마트 u m i 차이가 뭐야"}}'
```

브랜드가 없는 첫 요청은 브랜드 선택 응답을 반환합니다. 빠른응답을 선택하면 카카오가
`[브랜드:laurastar] 스마트 u m i 차이가 뭐야`처럼 브랜드와 원 질문을 함께 다시 보내고,
서버는 해당 브랜드 FAQ에서 답변을 찾습니다. 이후 같은 사용자 질문은 저장된 브랜드 기준으로
바로 답변하며, `브랜드 변경` 빠른응답을 누르면 저장된 브랜드를 지우고 다시 브랜드 선택으로
돌아갑니다.

브랜드를 별도 파라미터로 넘길 수 있는 경우에는 `action.params.brand` 또는
`action.detailParams.brand.value`에 `laurastar`, `woods`, `로라스타`, `우즈` 값을 넣으면
바로 해당 브랜드 답변을 반환합니다.

응답은 카카오 `SkillResponse` 형식입니다.

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "문의하신 내용은 Smart 시리즈 항목으로 안내드립니다.\n\n세 모델 모두 DMS 미세 건식 스팀과..."
        }
      }
    ],
    "quickReplies": []
  }
}
```

답변은 공식 FAQ 톤의 본문을 우선으로 하고, 필요한 경우 공식 링크 버튼과 간단한 빠른응답만 함께 포함합니다.
AS/수리/교환/반품/취소 문의도 FAQ 데이터에 등록된 답변을 반환합니다.

## FAQ 데이터

- 원본: `laurastar cs manual.xlsx`
- 정제 데이터: `data/laurastar-faq.json`
- 요약 문서: `docs/laurastar-faq.md`

공개 챗봇 응답에 부적합한 계좌번호, 내부 결제 링크, 상담원용 문자 템플릿은 정제 과정에서 제외했습니다.
