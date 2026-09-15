# 챗봇 분석 데이터 패키지

생성 기준: 2026-06-30 10:30 KST

## 분석 범위

- 전체 운영 이력 범위: 2026-05-20 22:17:36 ~ 2026-06-30 10:21:51 KST
- 개선 전 재평가 기준 범위: 2026-05-20 22:17:36 ~ 2026-06-28 20:06:43 KST
- 원천 DB 행: 290건
- 배포 검증으로 분류해 집계에서 제외한 행: 10건
- 운영 또는 사용자 ID 미확인 행: 280건
- 사용자 ID는 SHA-256 기반 16자리 해시로 비식별화

## 파일 구성

| 파일 | 용도 |
|---|---|
| `00_kpi_summary.csv` | 보고서 상단 KPI와 기간·산식 주석 |
| `01_history_raw.csv` | 전체 원천 이력, 테스트 분류 및 비식별 사용자 포함 |
| `02_time_series_day_week_month.csv` | 일·주·월·브랜드별 요청, 매칭, 사용자, 세션 추이 |
| `03_brand_summary.csv` | 전체 기간 브랜드 비교 |
| `04_session_detail_30min.csv` | 30분 비활동 기준 세션 상세 |
| `05_faq_ranking.csv` | FAQ별 이용 횟수·사용자·점수 순위 |
| `06_historical_unmatched_replay.csv` | 과거 미매칭 질문의 현재 매처 재평가 결과 |
| `07_faq_inventory.csv` | 브랜드별 FAQ·키워드 자산 현황 |
| `08_visualization_long_format.csv` | BI·피벗·차트용 장형 시계열 |
| `09_forecast_scenarios_4_8_12_weeks.csv` | 보수·기준·목표 시나리오 전망 |
| `10_change_and_future_chart_data.csv` | 개선 전·재평가·향후 전망 비교 차트 데이터 |
| `11_monthly_change_and_forecast.csv` | 5~6월 관측 변화와 7~9월 시나리오별 월간 전망 |
| `12_monthly_brand_change_and_forecast.csv` | 브랜드별 5~6월 변화와 7~9월 시나리오 전망 |
| `13_weekly_change_and_forecast.csv` | 전체 주별 관측 변화와 향후 12주 시나리오 전망 |
| `14_weekly_brand_change_and_forecast.csv` | 브랜드별 주간 변화와 향후 12주 시나리오 전망 |

## 권장 시각화

1. `02_time_series_day_week_month.csv`: 주별 요청량은 세로 막대, 매칭률은 보조축 꺾은선
2. `03_brand_summary.csv`: 브랜드별 매칭률과 FAQ 종료 추정률 묶은 막대
3. `05_faq_ranking.csv`: FAQ 이용 상위 10개 가로 막대
4. `06_historical_unmatched_replay.csv`: 브랜드별 처리 가능 전환/잔여 누적 막대
5. `09_forecast_scenarios_4_8_12_weeks.csv`: 기간별 예상 매칭·미매칭 누적 막대
6. `10_change_and_future_chart_data.csv`: 개선 전, 재평가, 보수·기준·목표 매칭률 변화선
7. `11_monthly_change_and_forecast.csv`: 월별 요청량 막대와 매칭률 보조축 꺾은선
8. `12_monthly_brand_change_and_forecast.csv`: 브랜드별 월간 요청량·매칭률 패널 또는 필터형 차트
9. `13_weekly_change_and_forecast.csv`: 주별 요청량 막대와 매칭률 보조축 꺾은선
10. `14_weekly_brand_change_and_forecast.csv`: 브랜드별 주간 스몰멀티플 또는 필터형 추이 차트

## 전망 해석

- 기준 문의량은 2026-05-20부터 2026-06-28까지 40일간 262건, 일평균 6.55건이다.
- 보수 시나리오는 재평가 개선 폭의 70%만 운영에서 실현한다고 가정한다.
- 기준 시나리오는 과거 미매칭 재평가 결과가 운영에서도 유지된다고 가정한다.
- 목표 시나리오는 잔여 미매칭 보강 후 매칭률 90%를 목표로 둔다.
- 이는 개선본 운영 표본이 충분하지 않은 상태의 시나리오 계획이며 통계적 예측 모델 결과가 아니다.

## 상담 절감 지표 주의

`faq_end_proxy_rate_pct`는 세션의 마지막 질문이 매칭된 뒤 추가 FAQ 요청이 없는 비율이다. 상담사 연결 클릭, 실제 상담 채널 진입, 해결 여부 이벤트가 현재 저장되지 않으므로 실제 해결률 또는 상담 억제율로 사용하면 안 된다.

실제 효과 측정을 위해 `handoff_clicked`, `handoff_connected`, `resolved_yes`, `resolved_no` 이벤트 수집이 필요하다.
