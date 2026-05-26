\*\*\*\*# Laurastar Kakao Chatbot 내부 보고서

작성일: 2026-05-13  
대상: Laurastar FAQ 기반 Kakao 챗봇 스킬 서버  
저장소: `chatbot_skill_server`

## 1. 프로젝트 개요

본 프로젝트는 로라스타 고객 문의를 Kakao 챗봇 스킬로 응답하기 위한 FAQ 서버입니다.  
Cloudflare Workers 배포를 기본 운영 방식으로 사용하며, 로컬에서는 Node 서버와 Wrangler 개발 서버로 테스트할 수 있습니다.

핵심 목적은 다음과 같습니다.

- 고객이 입력한 자연어 질문을 Laurastar FAQ 데이터와 매칭
- Kakao SkillResponse 2.0 형식에 맞는 응답 반환
- 공식 FAQ처럼 짧고 신뢰감 있는 카드형 답변 제공
- AS/수리, 주문/배송/반품 등 운영 문의도 상담 메뉴로 넘기기 전에 FAQ 답변 우선 제공
- Cloudflare Workers 기반으로 가볍게 배포 및 운영

## 2. 현재 구현 상태

현재 구현은 운영 테스트 가능한 기본 구성을 갖춘 상태입니다.

- FAQ 데이터 구축 완료
  - `data/laurastar-faq.json`
  - 총 10개 카테고리, 54개 FAQ
- Kakao SkillResponse 응답 포맷 구현 완료
  - `version: "2.0"`
  - `basicCard`
  - `quickReplies`
  - 카드 썸네일 포함
- 로컬 Node 서버 구현 완료
  - `src/server.js`
- Cloudflare Workers 라우트 구현 완료
  - `src/worker.js`
- FAQ 검색/매칭 로직 구현 완료
  - `src/faq.js`
- Kakao 요청 발화 추출 로직 구현 완료
  - `src/kakao.js`
- 공식 톤의 응답 카드 생성 로직 구현 완료
  - `src/skill-response.js`
- 회귀 테스트 구성 완료
  - `test/faq.test.js`

## 3. FAQ 데이터 구성

FAQ 원본은 `laurastar cs manual.xlsx` 기준으로 정리되었고, 공개 챗봇 응답에 부적합한 내용은 제외했습니다.

제외한 항목은 다음과 같습니다.

- 계좌번호
- 내부 결제 링크
- 상담원 전용 문자 템플릿
- 고객별 검수 결과에 따라 달라질 수 있는 상세 비용 안내

현재 FAQ 카테고리 구성은 다음과 같습니다.

| 카테고리               | FAQ 수 | 주요 내용                                   |
| ---------------------- | -----: | ------------------------------------------- |
| 공통 사용/관리         |      6 | 물 사용, 첫 사용, 예열, 설명서, 정품등록    |
| Smart 시리즈           |      4 | Smart I/M/U 차이, GO+ 비교, 물 공급         |
| GO+                    |      3 | 예열, 물 보충, 커버 호환                    |
| Lift 시리즈            |      8 | 모델 차이, 펄스 스팀, 필터, 소음, 열판 청소 |
| IZZI 시리즈            |      9 | 모델 차이, 필터, 보일러 청소, 물 부족 경고  |
| IGGI 핸디형 스티머     |      6 | 물 사용, 마개 보관, 석회질 제거, 마개 잠김  |
| 다리미판/커버/액세서리 |      4 | 커버 호환, 보관 두께, 균형, UD 다리미판     |
| AS/수리                |      8 | 수거, 검수 기간, 포장, 유상/정상 반송       |
| 주문/배송/반품         |      5 | 변심 반품, 모델 변경, 구성품 배송, 보상판매 |
| SKU/모델 코드          |      1 | 주요 모델 코드                              |

## 4. 서버 및 배포 구조

### 로컬 Node 서버

파일: `src/server.js`

로컬 개발 및 단순 API 테스트용 서버입니다.

실행 명령:

```bash
npm start
```

기본 포트:

```txt
http://localhost:3000
```

### Cloudflare Workers

파일: `src/worker.js`  
설정: `wrangler.jsonc`

운영 배포 대상입니다. Worker 이름은 `gv-chatbots`로 설정되어 있습니다.

개발 서버 실행:

```bash
npm run worker:dev
```

배포:

```bash
npm run worker:deploy
```

Kakao 챗봇 관리자센터에는 아래 형식의 URL을 스킬 URL로 등록합니다.

```txt
https://배포된-worker-도메인/skill/laurastar/faq
```

## 5. 주요 엔드포인트

| Method | Path                                  | 용도                                 |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/health`                             | 서버 상태, 브랜드, FAQ 개수 확인     |
| GET    | `/faq/categories`                     | FAQ 카테고리 목록 확인               |
| GET    | `/faq/search?q=질문`                  | 브라우저/로컬 검색 테스트            |
| POST   | `/faq/search`                         | 검색 API 또는 Kakao payload 테스트   |
| GET    | `/faq/guide`                          | Kakao 카드/빠른응답 샘플 확인        |
| POST   | `/skill/laurastar/faq`                | Kakao 챗봇 스킬 연동 메인 엔드포인트 |
| GET    | `/assets/laurastar-chatbot-intro.png` | 카드 썸네일 이미지                   |

`GET /faq/search`는 일반 검색 JSON을 반환합니다.  
`POST /faq/search`는 Kakao payload 형태가 들어오면 Kakao SkillResponse 형식으로 반환합니다.

## 6. Kakao 요청 처리 방식

Kakao 요청에서 실제 사용자 질문은 항상 같은 위치에 들어오지 않을 수 있습니다.  
현재 서버는 아래 순서로 발화를 추출합니다.

1. `action.detailParams.utterance.value`
2. `action.detailParams.utterance.origin`
3. `action.params.question`
4. `action.params.utterance`
5. `userRequest.utterance`

이 순서는 실제 연동 중 `userRequest.utterance`가 `"발화 내용"`처럼 placeholder로 들어오는 경우를 대응하기 위한 것입니다.

## 7. FAQ 매칭 방식

FAQ 매칭은 단순 키워드 포함만 보지 않고, 다음 요소를 함께 반영합니다.

- 질문 문장 정규화
- 한글/영문 경계 분리
- `AS`, `As`, `as`, `A/S` 같은 표기 통일
- 제품명 alias 처리
- 주요 동의어 확장
  - 예: 고플러스, GO+, go
  - 예: 사용설명서, 설명서, 매뉴얼
  - 예: 정품등록, 제품등록
- 질문/키워드/카테고리 유사도 점수화
- 확신도가 낮거나 1, 2위 점수 차이가 작은 경우 fallback 처리

특히 아래 케이스는 별도 회귀 테스트로 보호하고 있습니다.

- `어떤 물을 사용해야 하나요?`
- `잇지 물 부족 경고등이 떠요`
- `AS 접수 얼마나 걸려`
- `As접수 얼마나 걸려`
- `IGGI 마개가 안 열려요`
- `스마트 u m i 차이 알려줘`
- `고플러스 스마트 차이`

## 8. 응답 UX 정책

현재 응답은 “브랜드 공식 FAQ”에 가까운 짧은 카드형 응답을 기준으로 구성되어 있습니다.

기본 응답 구조:

- `basicCard` 1개
- FAQ 질문을 카드 제목으로 사용
- FAQ 답변을 카드 본문으로 사용
- 필요한 경우 공식 링크 버튼 제공
- 하단에 최대 4개 빠른응답 제공

빠른응답 기본 구성:

1. 관련 FAQ 1개
2. `AS 신청`
3. `사용 설명서`
4. `상담원 연결`

`AS 신청` 버튼은 실제 발화 메시지를 `AS 접수`로 보냅니다.  
빠른응답은 최대 4개로 제한해 Kakao 화면에서 우측 버튼이 밀려 사라지는 문제를 줄였습니다.

## 9. 최근 반영된 주요 개선사항

### 9.1 Kakao 발화 추출 개선

기존에는 `userRequest.utterance`를 우선 사용하면 실제 질문 대신 placeholder 문구가 매칭될 수 있었습니다.  
현재는 `action.detailParams`와 `action.params`를 먼저 확인하도록 개선했습니다.

### 9.2 POST `/faq/search` Kakao 응답 지원

Cloudflare 연동 테스트에서 `/faq/search`로 들어온 POST 요청도 Kakao payload일 수 있음이 확인되었습니다.  
현재는 `payload.userRequest` 또는 `payload.action`이 있으면 일반 검색 JSON이 아니라 Kakao SkillResponse를 반환합니다.

### 9.3 공식 FAQ 톤 정리

초기 응답의 다중 카드, 긴 목록, 데모성 문구를 줄이고 짧은 카드형 안내로 정리했습니다.  
본문에는 FAQ 답변을 중심으로 보여주고, 추가 탐색은 quickReplies로 넘깁니다.

### 9.4 AS/주문/반품 시나리오 핸드오프 제거

기존에는 AS/배송/반품성 질문을 별도 상담 메뉴로 넘기는 흐름이 있었으나, 현재는 FAQ 데이터에 등록된 답변을 우선 반환합니다.

### 9.5 AS 표기 정규화

아래 입력은 같은 의미로 처리되도록 개선했습니다.

- `AS`
- `As`
- `as`
- `A/S`
- `a/s`
- `As접수`

### 9.6 물 사용 질문 매칭 안정화

`어떤 물을 사용해야 하나요?` 같은 질문이 `물 부족 경고등` 관련 FAQ로 잘못 매칭되는 문제를 방지했습니다.  
물 사용 의도가 명확한 질문은 `common-water-type` FAQ가 우선 매칭되도록 보정했습니다.

## 10. 테스트 현황

테스트 명령:

```bash
npm test
```

현재 테스트 파일:

```txt
test/faq.test.js
```

테스트 범위:

- FAQ 데이터 로드
- FAQ 개수 검증
- 제품별 주요 질문 매칭
- Kakao 발화 추출 우선순위
- Kakao basicCard 썸네일 필수값
- 요청 origin 기반 썸네일 URL 생성
- `/faq/search` POST 검색
- `/faq/search` Kakao payload 응답
- AS 표기 변형 매칭
- 공식 톤 응답 구조 검증
- AS 카테고리/FAQ 응답 검증

## 11. 운영자가 확인할 테스트 URL

로컬 Node 서버 기준:

```txt
http://localhost:3000/health
http://localhost:3000/faq/categories
http://localhost:3000/faq/search?q=스마트%20u%20m%20i%20차이
http://localhost:3000/faq/search?q=AS%20접수%20얼마나%20걸려
http://localhost:3000/faq/guide
```

Kakao 스킬 POST 테스트 예시:

```bash
curl -s -X POST http://localhost:3000/skill/laurastar/faq \
  -H 'content-type: application/json' \
  -d '{"userRequest":{"utterance":"AS 접수 얼마나 걸려"}}'
```

응답에서 확인할 핵심값:

- `version`이 `"2.0"`인지
- `template.outputs[0].basicCard`가 있는지
- `basicCard.thumbnail.imageUrl`이 있는지
- `template.quickReplies`가 정상 노출되는지

## 12. 운영 리스크 및 주의사항

### 제품 정보 최신성

FAQ 원본은 상담 매뉴얼 기반입니다. 제품 스펙, SKU, 판매 링크, 공식몰 URL은 변경될 수 있으므로 운영 전 최종 확인이 필요합니다.

### AS 비용/정책 자동응답 제한

AS 비용, 검수 결과, 교환/반품 가능 여부는 고객별 상황에 따라 달라질 수 있습니다.  
현재 FAQ는 일반 안내 수준으로 제한되어 있으며, 확정 안내가 필요한 건은 상담원 연결이 필요합니다.

### Kakao 화면 제한

Kakao quickReplies는 화면 폭에 따라 일부 버튼이 잘릴 수 있습니다.  
현재는 최대 4개로 제한했지만, 실제 기기에서 노출 상태를 확인하는 것이 좋습니다.

### 서버 반영 방식

`data/laurastar-faq.json` 또는 매칭 로직을 수정한 뒤에는 실행 중인 로컬 서버나 Worker 개발 서버를 재시작해야 변경 사항이 반영됩니다.

## 13. 남은 작업 제안

운영 안정성을 높이기 위해 아래 작업을 권장합니다.

1. Kakao 관리자센터 실제 스킬 URL 등록 후 실기기 응답 확인
2. 공식몰 기준 제품명, SKU, 링크 최종 검수
3. AS/반품/교환 정책 문구를 운영팀 기준으로 최종 승인
4. 상담원 연결 발화가 실제 Kakao 시나리오와 연결되는지 확인
5. 운영 중 미매칭 질문 로그를 모아 FAQ와 키워드 보강
6. Cloudflare Workers 배포 후 `/health`, `/faq/search`, `/skill/laurastar/faq` 순서로 운영 검증

## 14. 내부 공유용 요약

Laurastar Kakao 챗봇 FAQ 서버는 현재 Cloudflare Workers 배포 가능한 구조로 구현되어 있습니다.  
FAQ는 10개 카테고리, 54개 문항으로 정리되어 있으며, Kakao SkillResponse 2.0 형식의 카드형 응답을 반환합니다.

주요 개선으로는 Kakao 발화 추출 우선순위 보정, POST `/faq/search` Kakao payload 대응, AS/주문/반품 FAQ 우선 응답, AS 표기 정규화, 물 사용 질문 매칭 안정화가 반영되어 있습니다.

운영 전에는 Kakao 관리자센터 실제 연동 테스트, 공식몰 링크/제품 정보 검수, AS 정책 문구 승인이 필요합니다.
