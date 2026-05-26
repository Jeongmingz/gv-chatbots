# Laurastar FAQ 데이터 처리 프로세스 정리

작성일: 2026-05-13  
대상 파일: `data/laurastar-faq.json`

## 1. 전체 흐름 요약

고객 질문이 들어오면 서버는 아래 순서로 처리합니다.

1. Kakao 요청 payload에서 실제 고객 질문을 추출
2. `data/laurastar-faq.json`의 FAQ 데이터를 평탄화
3. 고객 질문을 정규화하고 토큰화
4. 각 FAQ의 `question`, `keywords`, `category aliases`와 비교해 점수 계산
5. 가장 적합한 FAQ가 있으면 Kakao `basicCard`로 답변
6. FAQ에 `links`가 있으면 카드 버튼으로 외부 링크 제공
7. 하단 quickReplies에 관련 FAQ, `AS 신청`, `사용 설명서`, `상담원 연결` 제공
8. 매칭이 약하거나 질문이 넓으면 fallback 또는 카테고리 추천 응답 제공

## 2. FAQ 데이터 구조

`data/laurastar-faq.json`은 아래 구조로 구성되어 있습니다.

```json
{
  "brand": "Laurastar",
  "locale": "ko-KR",
  "source": "laurastar cs manual.xlsx",
  "version": "2026-05-07",
  "categories": []
}
```

각 카테고리는 다음 필드를 가집니다.

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 카테고리 식별자 |
| `name` | 고객/운영자가 보는 카테고리명 |
| `aliases` | 질문 매칭에 사용하는 대체 명칭 |
| `faqs` | 해당 카테고리의 FAQ 목록 |

각 FAQ는 다음 필드를 가집니다.

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 FAQ 식별자 |
| `question` | 카드 제목 및 quickReply 문구로 사용되는 질문 |
| `answer` | 카드 본문으로 노출되는 답변 |
| `keywords` | 질문 매칭용 키워드 |
| `links` | 선택 필드. 카드 버튼으로 노출할 외부 URL |

현재 데이터는 10개 카테고리, 54개 FAQ로 구성되어 있습니다.

## 3. 원본 XLSX 변환 방식

원본 `laurastarcsmanual.xlsx`는 정규화된 FAQ 테이블이 아니라 상담원이 참고하거나 고객에게 발송하던 매뉴얼 문구가 시트와 셀에 흩어져 있는 형태입니다.

원본 파일 구조:

- `AS ` 시트
- `Sheet1`
- `Sheet2`
- `sharedStrings.xml`에 상담 문구, 링크, 제품 안내 텍스트 포함

따라서 변환은 엑셀의 각 행을 그대로 JSON으로 옮긴 것이 아니라, 아래 기준으로 공개 챗봇용 FAQ를 재구성한 방식입니다.

1. 원본 XLSX 내부 텍스트 추출
2. 상담원용 장문 템플릿, 반복 인사말, 내부 처리 문구 제거
3. 고객이 실제로 물어볼 질문 단위로 재분류
4. 제품/업무 영역별 카테고리 구성
5. 카테고리별 FAQ `question`, `answer`, `keywords`, `links` 작성
6. 공개 노출하면 안 되는 민감 정보 제외
7. Kakao 챗봇에서 짧게 읽히도록 답변 문장 정리

제외 기준:

- 계좌번호
- 내부 결제 링크
- 상담원 전용 문자 템플릿
- 고객별 검수 결과에 따라 달라지는 비용/판정 문구
- 반복 인사말과 마무리 문구
- 자동 답변으로 확정 안내하기 어려운 내부 처리 내용

즉, `laurastarcsmanual.xlsx`는 원천 지식 자료이고, `data/laurastar-faq.json`은 그 내용을 고객 질문/답변 단위로 가공한 운영용 데이터입니다.

## 4. 키워드 선택 방식

각 FAQ의 `keywords`는 고객 질문을 해당 FAQ로 연결하기 위한 검색 신호입니다.  
키워드는 답변 본문 전체에서 자동 추출한 것이 아니라, 사람이 질문 의도를 기준으로 선택한 핵심 단어입니다.

선택 기준은 다음과 같습니다.

1. 제품명
   - 예: `스마트`, `Smart`, `GO+`, `고플러스`, `리프트`, `IZZI`, `잇지`, `IGGI`
2. 증상/문제 상황
   - 예: `물부족`, `경고등`, `스팀안나옴`, `마개`, `코드선`, `소리`, `흔들`
3. 고객이 실제로 쓸 표현
   - 예: `안 열`, `안 들어`, `교체`, `호환`, `구매`, `정품등록`
4. FAQ를 구분하는 핵심 의도
   - 예: `차이`, `비교`, `예열`, `필터`, `보일러`, `청소`
5. 같은 의미의 다른 표현
   - 예: `사용설명서`, `설명서`, `매뉴얼`
   - 예: `정품등록`, `제품등록`, `시리얼`

키워드 작성 시 주의한 점:

- 너무 일반적인 단어만 넣으면 오매칭이 생기므로 제품명이나 증상어와 같이 조합했습니다.
- `물`, `스팀`, `필터`처럼 여러 FAQ에 걸치는 단어는 다른 키워드와 함께 점수화되도록 했습니다.
- `AS`, `A/S`, `as`처럼 표기가 다양한 단어는 키워드 자체와 정규화 로직을 함께 사용했습니다.
- 외부 링크가 필요한 FAQ는 `links`를 별도로 넣고, 키워드는 질문 매칭에만 사용했습니다.

## 5. 질문 추출 프로세스

Kakao payload 안에서 실제 질문 위치가 달라질 수 있어, 서버는 아래 순서로 발화를 찾습니다.

1. `action.detailParams.utterance.value`
2. `action.detailParams.utterance.origin`
3. `action.params.question`
4. `action.params.utterance`
5. `userRequest.utterance`

이 순서는 `userRequest.utterance`가 `"발화 내용"` 같은 placeholder로 들어오는 상황을 방지하기 위한 것입니다.

## 6. 유사도 검사 방식

서버는 `data/laurastar-faq.json`의 카테고리형 데이터를 먼저 평탄화합니다.  
즉, 모든 FAQ에 `categoryId`, `categoryName`, `categoryAliases`를 붙여 검색 가능한 목록으로 바꿉니다.

이후 고객 질문과 FAQ를 점수 방식으로 비교합니다. 별도 AI 임베딩이나 외부 검색 엔진을 쓰지 않고, 로컬 JavaScript 코드에서 규칙 기반 유사도 점수를 계산합니다.

검사 대상:

- 고객 질문
- FAQ의 `question`
- FAQ의 `keywords`
- FAQ가 속한 카테고리의 `aliases`

주요 기준은 다음과 같습니다.

- 질문과 FAQ 질문이 정확히 같으면 높은 점수
- 질문 문장이 FAQ 질문에 포함되거나 반대로 포함되면 가산점
- 제품명 alias가 질문에 있으면 가산점
- FAQ의 `keywords`와 고객 질문 토큰이 일치하면 가산점
- 특정 의도는 별도 보정
  - 예: `어떤 물을 사용`은 물 부족 경고등 FAQ보다 물 사용 FAQ를 우선
- 확신도가 낮으면 답변하지 않고 fallback 처리

정규화 처리에는 아래 내용이 포함됩니다.

- 대소문자 통일
- `AS`, `As`, `as`, `A/S`, `a/s` 통일
- 한글/영문 붙어 있는 문장 분리
  - 예: `As접수` -> `as 접수`
- 특수문자 제거
- 조사/어미 일부 제거
- 동의어 확장
  - 예: `고플러스`, `GO+`, `go`
  - 예: `설명서`, `매뉴얼`, `사용설명서`
  - 예: `정품등록`, `제품등록`

점수화 방식:

| 조건 | 처리 |
| --- | --- |
| 질문과 FAQ 질문이 완전히 같음 | 큰 가산점 |
| 질문 문장과 FAQ 질문이 서로 포함 관계 | 가산점 |
| 질문에 제품명 alias가 있음 | 가산점 |
| 고객 질문 토큰이 FAQ 질문 토큰과 일치 | 가산점 |
| 고객 질문 토큰이 FAQ `keywords`와 일치 | 더 큰 가산점 |
| 고객 질문 토큰과 FAQ 용어가 부분 포함 관계 | 작은 가산점 |
| 2개 이상 핵심어가 같이 맞음 | 추가 가산점 |
| 특정 의도와 맞지 않는 FAQ | 감점 |
| 점수가 너무 낮음 | fallback |
| 1위와 2위 차이가 작고 확신도가 낮음 | fallback |

현재 답변 확정 기준:

- 1위 FAQ 점수가 28점 미만이면 답변하지 않습니다.
- 1위와 2위 점수 차이가 8점 미만이고 1위 점수가 80점 미만이면 답변하지 않습니다.
- 답변하지 않는 경우 fallback 카드와 자주 묻는 질문 quickReplies를 제공합니다.

유사도 검사 예시:

| 고객 질문 | 주요 매칭 신호 | 최종 FAQ |
| --- | --- | --- |
| `스마트 u m i 차이 알려줘` | `스마트`, `u`, `m`, `i`, `차이` | `smart-model-differences` |
| `As접수 얼마나 걸려` | `as` 정규화, `접수`, `얼마나` | `as-pickup-time` |
| `이기 마개가 안 열려요` | `이기 -> iggi`, `마개`, `안 열` | `iggi-cap-stuck` |
| `어떤 물을 사용해야 하나요?` | `물`, `사용`, 전용 의도 보정 | `common-water-type` |
| `잇지 물 부족 경고등이 떠요` | `잇지`, `물부족`, `경고등` | `izzi-lift-water-warning` |

## 7. 정상 FAQ 답변 프로세스

FAQ가 매칭되면 Kakao 응답은 아래 구조로 생성됩니다.

```txt
basicCard
- title: FAQ question
- description: FAQ answer + 공식 상담 안내 문구
- thumbnail: /assets/laurastar-chatbot-intro.png
- buttons: FAQ links가 있을 때만 생성

quickReplies
- 관련 FAQ 1개
- AS 신청
- 사용 설명서
- 상담원 연결
```

`basicCard` 버튼은 최대 3개까지만 노출됩니다.  
quickReplies는 최대 4개까지만 노출됩니다.

## 8. 상담원 연결 프로세스

현재 `상담원 연결`은 외부 URL 버튼이 아니라 quickReply입니다.

응답 하단에 아래 quickReply가 포함됩니다.

```json
{
  "label": "상담원 연결",
  "action": "message",
  "messageText": "상담원 연결"
}
```

즉, 고객이 `상담원 연결`을 누르면 Kakao 안에서 `"상담원 연결"`이라는 메시지가 다시 발화됩니다.  
이후 실제 상담원 연결 여부는 Kakao 챗봇 관리자센터의 시나리오/블록 설정에서 해당 발화를 어떻게 연결했는지에 따라 결정됩니다.

현재 코드 자체가 상담원 연결 URL로 직접 이동시키지는 않습니다.

## 9. AS 신청 프로세스

`AS 신청`도 quickReply로 제공됩니다.

```json
{
  "label": "AS 신청",
  "action": "message",
  "messageText": "AS 접수"
}
```

고객 화면에는 `AS 신청`으로 보이지만, 클릭 시 Kakao에는 `AS 접수`라는 메시지가 다시 입력됩니다.

다만 일부 FAQ는 `links`에 AS 접수 URL을 직접 가지고 있습니다.  
이 경우 카드 안에 `AS 접수` 버튼이 생성되어 외부 페이지로 이동합니다.

AS 접수 URL:

```txt
https://www.gatevision.co.kr/front/cswrite?brand=laurastar
```

## 10. 외부 링크 이동 프로세스

FAQ에 `links` 배열이 있으면 Kakao 카드 버튼으로 외부 링크가 생성됩니다.

버튼 라벨은 URL 패턴에 따라 자동 결정됩니다.

| URL 조건 | 버튼 라벨 |
| --- | --- |
| `cswrite?brand=laurastar` 포함 | `AS 접수` |
| `serialregist` 포함 | `정품등록` |
| `manual` 포함 | `매뉴얼` |
| `brand.naver.com` 포함 | `구매하기` |
| `video.php` 또는 `vo.la` 포함 | `영상 보기` |
| 그 외 | `링크 1`, `링크 2` |

외부 링크 버튼은 Kakao `webLink` 액션으로 생성됩니다.

```json
{
  "action": "webLink",
  "label": "매뉴얼",
  "webLinkUrl": "https://www.laurastar.co.kr/front/board/manual"
}
```

## 11. 현재 외부 링크가 있는 FAQ

현재 `links`가 들어 있는 FAQ는 총 8개입니다.

| 카테고리 | FAQ ID | 질문 | 버튼 |
| --- | --- | --- | --- |
| 공통 사용/관리 | `common-manual-video` | 사용 설명서나 영상은 어디서 볼 수 있나요? | `매뉴얼`, `영상 보기` |
| 공통 사용/관리 | `common-product-registration` | 정품 등록은 어디서 하나요? | `정품등록` |
| IZZI 시리즈 | `izzi-lift-filter-buy` | IZZI/Lift 필터는 어디서 구매하나요? | `구매하기` |
| IGGI 핸디형 스티머 | `iggi-descaling` | IGGI 석회질 제거는 어떻게 하나요? | `구매하기` |
| IGGI 핸디형 스티머 | `iggi-cap-stuck` | IGGI 마개가 열리지 않아요. | `AS 접수` |
| AS/수리 | `as-before-check` | 불량이 의심되면 바로 AS 접수해야 하나요? | `AS 접수` |
| AS/수리 | `as-smart-boiler-packing` | Smart/시스템 제품 보일러통 AS 포장은 어떻게 하나요? | `영상 보기` |
| AS/수리 | `as-board-only-packing` | 시스템 다리미판만 AS 보낼 때 어떻게 하나요? | `영상 보기` |

## 12. fallback 처리

아래 상황에서는 특정 FAQ 답변 대신 안내 카드가 반환됩니다.

- 질문이 비어 있음
- `FAQ`, `질문`, `자주 묻는 질문`처럼 넓은 요청
- 매칭 점수가 낮음
- 1위와 2위 FAQ 점수 차이가 작아 확신하기 어려움

fallback 응답은 다음 구조입니다.

- 카드 제목: `안내`
- 본문: 질문과 바로 연결되지 않았다는 안내
- quickReplies: 자주 쓰는 FAQ 목록

자주 쓰는 FAQ 기준 목록은 코드에 고정되어 있습니다.

- `common-water-type`
- `common-manual-video`
- `common-product-registration`
- `smart-model-differences`
- `smart-vs-go-plus`
- `izzi-lift-filter-replacement`
- `iggi-cap-stuck`
- `board-cover-compatibility`

## 13. 카테고리 질문 처리

고객이 특정 카테고리의 질문 목록을 요청하면 카테고리 추천 응답을 반환합니다.

예시:

```txt
AS/수리 질문 보기
Lift 질문 목록
주문 배송 반품 질문 추천
```

처리 조건:

- 질문에 `질문`, `목록`, `추천`, `보기` 중 하나가 포함
- 동시에 카테고리명 또는 alias가 포함

응답은 해당 카테고리의 FAQ를 최대 5개까지 보여주고, quickReplies로 선택 가능하게 만듭니다.

## 14. 운영 관점 정리

현재 프로세스는 “FAQ 답변 우선, 필요 시 링크/상담 메뉴 제공” 방식입니다.

- 일반 질문: FAQ 카드 답변
- 링크가 있는 FAQ: FAQ 카드 + 외부 링크 버튼
- AS 신청: quickReply로 `AS 접수` 발화 유도
- 상담원 연결: quickReply로 `상담원 연결` 발화 유도
- 실제 상담원 전환: Kakao 관리자센터 시나리오 설정에 의존
- 매칭 불명확: fallback 카드 + 자주 묻는 질문 quickReplies

따라서 내부 운영 시 확인해야 할 항목은 다음과 같습니다.

1. Kakao 관리자센터에서 `상담원 연결` 발화가 실제 상담 전환 블록으로 연결되어 있는지
2. Kakao 관리자센터에서 `AS 접수` 발화가 원하는 AS 접수 플로우로 연결되어 있는지
3. `https://www.gatevision.co.kr/front/cswrite?brand=laurastar` 링크가 현재 운영 페이지와 맞는지
4. 공식몰 매뉴얼/정품등록/네이버 브랜드스토어 링크가 최신인지
5. FAQ 답변 내 정책성 문구가 운영팀 기준과 일치하는지
