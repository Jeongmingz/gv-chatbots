# Laurastar Kakao Chatbot Skill Server

로라스타 FAQ 응답용 카카오 챗봇 스킬 서버입니다.

## 실행

```bash
npm start
```

기본 포트는 `3000`입니다. 배포 환경에서는 `PORT` 환경변수로 변경할 수 있습니다.

## Railway 배포

이 프로젝트는 Railway의 Nixpacks 배포를 기준으로 준비되어 있습니다.

1. 이 폴더만 별도 GitHub 저장소로 업로드합니다.
2. Railway에서 `New Project` -> `Deploy from GitHub repo`를 선택합니다.
3. 저장소를 연결하면 `railway.json` 설정에 따라 `npm start`로 실행됩니다.
4. 배포 후 Railway가 발급한 도메인의 `/health`가 정상인지 확인합니다.

카카오 챗봇 관리자센터 스킬 URL에는 아래 형식으로 등록합니다.

```txt
https://배포도메인/skill/laurastar/faq
```

## 엔드포인트

- `GET /health`: 서버/FAQ 데이터 상태 확인
- `GET /faq/categories`: FAQ 카테고리 목록 확인
- `GET /faq/search?q=질문`: 로컬 검색 테스트
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
          "text": "[Smart 시리즈]\n세 모델 모두 DMS 미세 건식 스팀과..."
        }
      }
    ],
    "quickReplies": []
  }
}
```

## FAQ 데이터

- 원본: `laurastar cs manual.xlsx`
- 정제 데이터: `data/laurastar-faq.json`
- 요약 문서: `docs/laurastar-faq.md`

공개 챗봇 응답에 부적합한 계좌번호, 내부 결제 링크, 상담원용 문자 템플릿은 정제 과정에서 제외했습니다.
