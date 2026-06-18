# 카드/그래프 확장 — 링깃(MYR) + 달러인덱스(DXY) 설계

**날짜:** 2026-06-18
**범위:** Phase 1 (뉴스 탭은 Phase 2로 분리). index.html + api/rates.js + 알림 백엔드 3파일.
**제약:** PC·모바일 UI 절대 복잡 금지.

---

## 1. 개요

- **MYR 링깃**: USD/JPY/CNY와 완전 동일한 1급 통화로 추가 (카드 + 그래프 선 + 알림).
- **DXY 달러인덱스**: 환전 통화가 아닌 "지수"라 별도 취급 — 지수 전용 미니카드 + 그래프 점선(해석 기준선). 살때/팔때·원 단위·알림 없음.

데이터 검증 완료 (Yahoo, 2026-06-18):
- `MYRKRW=X`: 현재 372.71원, 52주 319~386, 1년 260p — 직접 제공 (CNY 같은 크로스 불필요)
- `DX-Y.NYB`: 현재 100.25, 52주 95.6~100.6, 1년 252p — 직접 제공

---

## 2. MYR (완전 동일 통화)

| 항목 | 값 |
|------|-----|
| CURRENCIES | `{ code:'MYR', symbol:'MYRKRW=X', flag:'🇲🇾', name:'말레이시아 링깃', unit:'원/링깃' }` |
| 그래프 색 | 청록 `#0D9488` (USD파랑·JPY주황·CNY빨강과 비충돌) |
| 소수 자리 | 2 |
| 카드 | 기존 `renderCard` 그대로 재사용, `#card-MYR` 스켈레톤 추가 |
| 알림 | 카드 탭→목표 설정, USD/JPY/CNY와 동일 |

알림 백엔드 MYR 추가 위치: `lib/redis.js`(EMPTY.targets), `api/save-alert.js`(유효 코드), `scripts/check-alerts.mjs`(SYMBOLS·NAMES), `index.html`(alertTargets·ALERT_DECIMALS·코드 배열들).

---

## 3. DXY (지수 전용)

- **미니카드**: `📊 달러인덱스` + 값(100.25) + 전일대비 % + 52주 레인지 바. 통화 카드와 구분되는 스타일(`.index-card`). 탭 비활성(알림 없음).
- **데이터**: `api/rates.js` current·history에 `DX-Y.NYB` 추가. meta 필드 동일(regularMarketPrice/chartPreviousClose/fiftyTwoWeekHigh·Low/regularMarketTime).
- **클라이언트**: DXY는 CURRENCIES에 안 넣음 → current/history에서 symbol로 분리 추출, `dxyData`·`dxyHistory`에 보관, `renderDxy()`로 미니카드 렌더.

---

## 4. 그래프

- 통화 4선(실선, 컬러) + **DXY 1선(점선 `borderDash:[5,4]`, 회색 `#9CA3AF`, 가늘게)**.
- 모두 "기간 시작 대비 등락률(%)"로 정규화 → 같은 축에 자연 중첩.
- 툴팁: DXY는 '원' 대신 지수값 표시(분기 처리). 통화는 기존대로 `±%·원`.
- 복잡도 안전장치: DXY 회색 점선=보조로 읽혀 통화 4선과 시선 분리.

---

## 5. 변경 파일

| 파일 | 변경 |
|------|------|
| `api/rates.js` | current·history에 MYRKRW=X·DX-Y.NYB 추가 |
| `index.html` | MYR 카드/그래프/알림, DXY 미니카드 + CSS + 점선, 툴팁 분기 |
| `lib/redis.js` | EMPTY.targets에 MYR |
| `api/save-alert.js` | 유효 코드에 MYR |
| `scripts/check-alerts.mjs` | SYMBOLS·NAMES에 MYR |

`sw.js` 변경 없음.

---

## 6. 수용 기준

- [ ] MYR 카드 표시(현재가·배지·52주 바), 그래프 청록 실선, 카드 탭→알림 설정·달성 동작
- [ ] DXY 미니카드 표시(값·전일대비·52주 바), 탭해도 알림 안 열림
- [ ] 그래프에 DXY 회색 점선 표시, 툴팁에서 DXY는 지수값
- [ ] PC·모바일 모두 레이아웃 단순 유지 (타일 6개, 통화 4선+점선)
- [ ] 기존 USD/JPY/CNY·알림·계산기 회귀 없음
