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
https://배포된-worker-도메인/skill/laurastar/faq
```

## 엔드포인트

- `GET /health`: 서버/FAQ 데이터 상태 확인
- `GET /faq/categories`: FAQ 카테고리 목록 확인
- `GET /faq/search?q=질문`: 로컬 검색 테스트
- `GET /faq/guide`: 카카오 카드/바로가기 응답 샘플
- `POST /skill/laurastar/faq`: 카카오 챗봇 스킬 연동 엔드포인트

## 카카오 스킬 요청 예시

```bash
curl -s -X POST http://localhost:3000/skill/laurastar/faq \
  -H 'content-type: application/json' \
  -d '{"userRequest":{"utterance":"스마트 u m i 차이가 뭐야"}}'
```

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
