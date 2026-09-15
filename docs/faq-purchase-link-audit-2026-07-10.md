# FAQ 구매 링크 전수조사 - 2026-07-10

## 조사 범위
- 대상 데이터: `data/laurastar-faq.json`, `data/woods-faq.json`, `data/aarke-faq.json`, `data/litter-robot-faq.json`, `data/imetec-faq.json`, `src/brands.js` 가이드 버튼
- 구매 링크 판정 기준: 질문/카테고리/키워드/URL에 구매, 구입, 필터, 실린더, 라이너, 카본, 트랩, 카펫, 계단, 파워, 커버, 조절기, 호스, 액세서리, 소모품 또는 구매 도메인이 포함된 URL
- HTTP 검증: 2026-07-10 KST 기준 `fetch` GET 요청, redirect follow

## 요약
- 구매 링크 레코드: 25건
- 정상: 10건
- 구 도메인 교체 권장: 7건
- 자동 검증 제한: 8건
- 수정 필요: 0건

## 브랜드별 집계
| 브랜드 | 총건 | 정상 | 구도메인 교체권장 | 자동검증제한 | 수정필요 |
|---|---:|---:|---:|---:|---:|
| laurastar | 2 | 0 | 0 | 2 | 0 |
| woods | 6 | 1 | 2 | 3 | 0 |
| aarke | 4 | 4 | 0 | 0 | 0 |
| litter-robot | 10 | 2 | 5 | 3 | 0 |
| imetec | 3 | 3 | 0 | 0 | 0 |

## 교체 권장 링크
| 브랜드 | FAQ/버튼 | 현재 URL | 교체 후보 | 현재상태 | 후보상태 |
|---|---|---|---|---:|---:|
| woods | woods-배수-호스는-어디에서-구매할수-있나요 | https://www.curationa.com/product/sw30fw-%EC%A0%84%EC%9A%A9-%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/925/category/177/display/1/ | https://gvcurate.com/product/sw30fw-%EC%A0%84%EC%9A%A9-%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/925/category/177/display/1/ | 200 | 200 |
| woods | woods-배수-호스는-어디에서-구매할수-있나요 | https://www.curationa.com/product/%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/926/category/177/display/1/ | https://gvcurate.com/product/%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/926/category/177/display/1/ | 200 | 200 |
| litter-robot | litter-robot-라이너는-어디에서-구매해나요 | https://www.curationa.com/product/search.html?banner_action=&keyword=%EB%9D%BC%EC%9D%B4%EB%84%88 | https://gvcurate.com/product/search.html?banner_action=&keyword=%EB%9D%BC%EC%9D%B4%EB%84%88 | 200 | 200 |
| litter-robot | litter-robot-카본필터는-어디에서-구매해나요 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%EB%B3%B8%ED%95%84%ED%84%B0-6p/937/category/159/display/1/ | https://gvcurate.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%EB%B3%B8%ED%95%84%ED%84%B0-6p/937/category/159/display/1/ | 200 | 200 |
| litter-robot | litter-robot-트랩매트는-어디에서-구매해나요 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%ED%8A%B8%EB%9E%A9%EB%A7%A4%ED%8A%B8/938/category/159/display/1/ | https://gvcurate.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%ED%8A%B8%EB%9E%A9%EB%A7%A4%ED%8A%B8/938/category/159/display/1/ | 200 | 200 |
| litter-robot | litter-robot-카펫트레이는-어디에서-구매해나요 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%ED%8E%AB-%ED%8A%B8%EB%A0%88%EC%9D%B4/881/category/159/display/1/ | https://gvcurate.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%ED%8E%AB-%ED%8A%B8%EB%A0%88%EC%9D%B4/881/category/159/display/1/ | 200 | 200 |
| litter-robot | litter-robot-계단은-어디에서-구매해나요 | https://www.curationa.com/product/search.html?banner_action=&keyword=%EA%B3%84%EB%8B%A8 | https://gvcurate.com/product/search.html?banner_action=&keyword=%EA%B3%84%EB%8B%A8 | 200 | 200 |

## 자동 검증 제한 링크
네이버 계열 링크는 자동 요청에서 429가 반환되었습니다. 챗봇 데이터상 링크 형식은 상품 URL이지만, 브라우저/운영 환경 수동 확인이 필요합니다.

| 브랜드 | FAQ | URL | 상태 |
|---|---|---|---:|
| laurastar | izzi-lift-filter-buy | https://brand.naver.com/laurastar/products/4758381107 | 429 |
| laurastar | iggi-descaling | https://brand.naver.com/laurastar/products/7091588040 | 429 |
| woods | woods-필터는-어디에서-구매하나요 | https://brand.naver.com/woods/products/10472591642 | 429 |
| woods | woods-필터는-어디에서-구매하나요 | https://brand.naver.com/woods/products/5728877145 | 429 |
| woods | woods-필터는-어디에서-구매하나요 | https://brand.naver.com/woods/products/5728882036 | 429 |
| litter-robot | litter-robot-글로브-라이너는-어디에서-구매해나요 | https://smartstore.naver.com/litter-robot/products/12218988627 | 429 |
| litter-robot | litter-robot-파워-서플라이는-어디에서-구매해나요 | https://smartstore.naver.com/litter-robot/products/12200940264 | 429 |
| litter-robot | litter-robot-필터-커버는-어디에서-구매해나요 | https://smartstore.naver.com/litter-robot/products/12200945843 | 429 |

## 전체 목록
| 브랜드 | 출처 | FAQ/버튼 | 질문 | URL | 상태 | 최종URL | 판정 |
|---|---|---|---|---|---:|---|---|
| laurastar | faq | izzi-lift-filter-buy | IZZI/Lift 필터는 어디서 구매하나요? | https://brand.naver.com/laurastar/products/4758381107 | 429 | https://brand.naver.com/laurastar/products/4758381107 | 자동검증제한 |
| laurastar | faq | iggi-descaling | IGGI 석회질 제거는 어떻게 하나요? | https://brand.naver.com/laurastar/products/7091588040 | 429 | https://brand.naver.com/laurastar/products/7091588040 | 자동검증제한 |
| woods | faq | woods-배수-호스는-어디에서-구매할수-있나요 | 배수 호스는 어디에서 구매할수 있나요? (SW30FW PRO) | https://www.curationa.com/product/sw30fw-%EC%A0%84%EC%9A%A9-%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/925/category/177/display/1/ | 200 | https://www.curationa.com/product/sw30fw-%EC%A0%84%EC%9A%A9-%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/925/category/177/display/1/ | 구도메인교체권장 |
| woods | faq | woods-배수-호스는-어디에서-구매할수-있나요 | 배수 호스는 어디에서 구매할수 있나요? (SW22FW) | https://www.curationa.com/product/%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/926/category/177/display/1/ | 200 | https://www.curationa.com/product/%EC%9A%B0%EC%A6%88-%EC%97%B0%EC%86%8D-%EB%B0%B0%EC%88%98-%ED%98%B8%EC%8A%A4-%EC%9B%90%ED%84%B0%EC%B9%98-%EC%BB%A4%ED%92%80%EB%9F%AC-%EA%B8%B8%EC%9D%B4-%EC%84%A0%ED%83%9D-%EA%B0%80%EB%8A%A5/926/category/177/display/1/ | 구도메인교체권장 |
| woods | faq | woods-필터는-어디에서-구매하나요 | 필터는 어디에서 구매하나요? (SW30FW PRO) | https://brand.naver.com/woods/products/10472591642 | 429 | https://brand.naver.com/woods/products/10472591642 | 자동검증제한 |
| woods | faq | woods-필터는-어디에서-구매하나요 | 필터는 어디에서 구매하나요? (SW22FW) | https://brand.naver.com/woods/products/5728877145 | 429 | https://brand.naver.com/woods/products/5728877145 | 자동검증제한 |
| woods | faq | woods-필터는-어디에서-구매하나요 | 필터는 어디에서 구매하나요? (SW22FW) | https://brand.naver.com/woods/products/5728882036 | 429 | https://brand.naver.com/woods/products/5728882036 | 자동검증제한 |
| aarke | faq | aarke-refill-cylinder-purchase | 충전 실린더는 어떻게 구매하나요? | https://gvcurate.com/product/detail.html?product_no=764 | 200 | https://gvcurate.com/product/detail.html?product_no=764 | 정상 |
| aarke | faq | aarke-product-purchase | 아르케 제품과 액세서리는 어디서 구매하나요? | https://gvcurate.com/ | 200 | https://gvcurate.com/ | 정상 |
| litter-robot | faq | litter-robot-라이너는-어디에서-구매해나요 | 라이너는 어디에서 구매해나요? | https://www.curationa.com/product/search.html?banner_action=&keyword=%EB%9D%BC%EC%9D%B4%EB%84%88 | 200 | https://www.curationa.com/product/search.html?banner_action=&keyword=%EB%9D%BC%EC%9D%B4%EB%84%88 | 구도메인교체권장 |
| litter-robot | faq | litter-robot-카본필터는-어디에서-구매해나요 | 카본필터는 어디에서 구매해나요? | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%EB%B3%B8%ED%95%84%ED%84%B0-6p/937/category/159/display/1/ | 200 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%EB%B3%B8%ED%95%84%ED%84%B0-6p/937/category/159/display/1/ | 구도메인교체권장 |
| litter-robot | faq | litter-robot-트랩매트는-어디에서-구매해나요 | 트랩매트는 어디에서 구매해나요? | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%ED%8A%B8%EB%9E%A9%EB%A7%A4%ED%8A%B8/938/category/159/display/1/ | 200 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%ED%8A%B8%EB%9E%A9%EB%A7%A4%ED%8A%B8/938/category/159/display/1/ | 구도메인교체권장 |
| litter-robot | faq | litter-robot-카펫트레이는-어디에서-구매해나요 | 카펫트레이는 어디에서 구매해나요? | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%ED%8E%AB-%ED%8A%B8%EB%A0%88%EC%9D%B4/881/category/159/display/1/ | 200 | https://www.curationa.com/product/%EB%A6%AC%ED%84%B0%EB%A1%9C%EB%B4%87-4-%EC%B9%B4%ED%8E%AB-%ED%8A%B8%EB%A0%88%EC%9D%B4/881/category/159/display/1/ | 구도메인교체권장 |
| litter-robot | faq | litter-robot-계단은-어디에서-구매해나요 | 계단은 어디에서 구매해나요? | https://www.curationa.com/product/search.html?banner_action=&keyword=%EA%B3%84%EB%8B%A8 | 200 | https://www.curationa.com/product/search.html?banner_action=&keyword=%EA%B3%84%EB%8B%A8 | 구도메인교체권장 |
| litter-robot | faq | litter-robot-글로브-라이너는-어디에서-구매해나요 | 글로브 라이너는 어디에서 구매해나요? | https://smartstore.naver.com/litter-robot/products/12218988627 | 429 | https://smartstore.naver.com/litter-robot/products/12218988627 | 자동검증제한 |
| litter-robot | faq | litter-robot-파워-서플라이는-어디에서-구매해나요 | 파워 서플라이는 어디에서 구매해나요? | https://smartstore.naver.com/litter-robot/products/12200940264 | 429 | https://smartstore.naver.com/litter-robot/products/12200940264 | 자동검증제한 |
| litter-robot | faq | litter-robot-필터-커버는-어디에서-구매해나요 | 필터 커버는 어디에서 구매해나요? | https://smartstore.naver.com/litter-robot/products/12200945843 | 429 | https://smartstore.naver.com/litter-robot/products/12200945843 | 자동검증제한 |
| litter-robot | faq | litter-robot-설명서를-추가로-받을수-있나요 | 설명서를 추가로 받을수 있나요? | https://www.litter-robot.kr/support/litter-robot-4/#tab-manuals | 200 | https://www.litter-robot.kr/support/litter-robot-4/ | 정상 |
| litter-robot | faq | litter-robot-offline-store-location | 리터로봇 오프라인 매장은 어디에 있나요? | https://www.litter-robot.kr/trialmember | 200 | https://www.litter-robot.kr/trialmember | 정상 |
| imetec | faq | imetec-조절기-파란불빛이-깜빡거려요-깜빡거리는-모든-문의 | 조절기 파란불빛이 깜빡거려요 / "깜빡"거리는 모든 문의 | https://www.gatevision.co.kr/front/customerservice | 200 | https://www.gatevision.co.kr/front/customerservice | 정상 |
| imetec | faq | imetec-조절기-구매-문의 | 조절기 구매 문의 | https://gvcurate.com/product/이메텍-전기요-전용-조절기/891/ | 200 | https://gvcurate.com/product/%EC%9D%B4%EB%A9%94%ED%85%8D-%EC%A0%84%EA%B8%B0%EC%9A%94-%EC%A0%84%EC%9A%A9-%EC%A1%B0%EC%A0%88%EA%B8%B0/891/ | 정상 |
| woods | guideButton | 제품등록 | 우즈 주요 안내 - 제품등록 | https://woods.co.kr/front/registuser | 200 | https://woods.co.kr/front/registuser | 정상 |
| aarke | guideButton | 제품등록 | 아르케 주요 안내 - 제품등록 | https://aarke.co.kr/account?location=serialRegist | 200 | https://www.aarke.co.kr/login | 정상 |
| aarke | guideButton | 실린더 구매 | 아르케 주요 안내 - 실린더 구매 | https://gvcurate.com/product/detail.html?product_no=764 | 200 | https://gvcurate.com/product/detail.html?product_no=764 | 정상 |
| imetec | guideButton | 조절기 구매 | 이메텍 주요 안내 - 조절기 구매 | https://gvcurate.com/product/이메텍-전기요-전용-조절기/891/ | 200 | https://gvcurate.com/product/%EC%9D%B4%EB%A9%94%ED%85%8D-%EC%A0%84%EA%B8%B0%EC%9A%94-%EC%A0%84%EC%9A%A9-%EC%A1%B0%EC%A0%88%EA%B8%B0/891/ | 정상 |