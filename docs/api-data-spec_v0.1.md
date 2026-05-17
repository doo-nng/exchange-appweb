# 환율 트렌드 대시보드 — API & 데이터 스펙 v0.2

| 항목 | 내용 |
|------|------|
| 출처 | 서비스기획서 v0.2 / PRD v0.1 |
| 상태 | Draft |
| 작성일 | 2025-05-17 |
| 변경 | v0.1 → v0.2: 데이터 소스를 Yahoo Finance 단일 소스로 통일 |

---

## 1. 데이터 소스 개요

단일 소스: **Yahoo Finance v8 Chart API** (무료, 인증 불필요)

| 항목 | 내용 |
|------|------|
| 기준 | 시장 환율 (FX 마켓) |
| 업데이트 | 실시간 준하는 FX 시세 |
| 제공 데이터 | 현재가, 전일 종가, 52주 고/저, 일별 과거 데이터 |
| 미제공 | 은행 고시 매매기준율, 현찰 살 때/팔 때 (FX 시장 데이터임) |
| 인증 | 불필요 |
| 한도 | 공식 한도 없음 (개인 사용 충분) |

> **참고:** 이전 버전에서는 은행 고시 "살 때/팔 때" 제공을 목표로 했으나, Yahoo Finance는 FX 시장 환율을 제공하므로 은행 스프레드 데이터는 포함되지 않는다. 시장 환율 기준 표시로 변경.

---

## 2. 엔드포인트 명세

### 2.1 현재 환율 + 52주 레인지

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d
```

**심볼 매핑**

| 통화 | 심볼 | 반환 단위 |
|------|------|----------|
| USD/KRW | `USDKRW=X` | 1달러당 원 |
| JPY/KRW | `JPYKRW=X` | **1엔당 원** (주의: 수출입은행과 달리 1엔 기준) |
| CNY/KRW | `CNYKRW=X` | 1위안당 원 |

**실측 응답 예시 (2025-05-17 기준)**

```json
{
  "chart": {
    "result": [{
      "meta": {
        "regularMarketPrice": 1497.76,
        "chartPreviousClose": 1492.68,
        "fiftyTwoWeekHigh": 1536.82,
        "fiftyTwoWeekLow": 1322.42,
        "regularMarketTime": 1747823400,
        "currency": "KRW",
        "symbol": "USDKRW=X"
      }
    }]
  }
}
```

**사용 필드**

| 필드 | 용도 |
|------|------|
| `meta.regularMarketPrice` | 현재 환율 표시 |
| `meta.chartPreviousClose` | 전일 종가 (변화량 계산) |
| `meta.fiftyTwoWeekHigh` | 52주 최고 |
| `meta.fiftyTwoWeekLow` | 52주 최저 |
| `meta.regularMarketTime` | 마지막 업데이트 Unix timestamp |

---

### 2.2 과거 1년 일별 데이터 (그래프 + 1년 평균 계산)

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1y
```

**실측 응답 구조**

```json
{
  "chart": {
    "result": [{
      "timestamp": [1715750400, 1716009600, ...],
      "indicators": {
        "quote": [{
          "close": [1381.23, 1375.50, ...],
          "open": [...],
          "high": [...],
          "low": [...]
        }]
      }
    }]
  }
}
```

- `timestamp`: Unix timestamp 배열 (초 단위)
- `indicators.quote[0].close`: 해당 날짜 종가 (null 포함 가능 — 주말/공휴일)
- **실측:** 1년 기준 약 261개 영업일 데이터 포인트 반환 확인

---

### 2.3 CORS 현황

- `curl` 테스트: 정상 데이터 반환 확인 ✅
- `Access-Control-Allow-Origin` 헤더: **없음**
- **브라우저 직접 호출 가능 여부:** 배포 환경에서 실제 브라우저 테스트 필요 (OQ-01)

---

## 3. JPY 표시 단위 처리

Yahoo Finance는 `JPYKRW=X`로 **1엔당 KRW**를 반환한다. (수출입은행 API와 반대)

- **화면 표시:** 1엔 기준으로 그대로 표시 (`9.41원/엔` 형태)
- "100엔 기준" 뱃지는 제거 (야후 파이낸스는 1엔 기준)
- 금액 계산기 구현 시 `amount × rate` 그대로 사용

---

## 4. 클라이언트 데이터 모델

### CurrencyRate (현재 환율)

```typescript
interface CurrencyRate {
  code: 'USD' | 'JPY' | 'CNY';
  name: string;
  symbol: string;           // Yahoo Finance 심볼 ("USDKRW=X" 등)
  rate: number;             // regularMarketPrice
  prevClose: number;        // chartPreviousClose
  change: number;           // rate - prevClose
  changePct: number;        // (change / prevClose) * 100
  high52w: number;          // fiftyTwoWeekHigh
  low52w: number;           // fiftyTwoWeekLow
  updatedAt: number;        // regularMarketTime (Unix timestamp)
  source: 'Yahoo Finance';
}
```

### HistoricalRates (과거 데이터)

```typescript
interface HistoricalRates {
  USD: DailyRate[];
  JPY: DailyRate[];
  CNY: DailyRate[];
  fetchedAt: string;  // 캐시 시각 ISO8601
}

interface DailyRate {
  timestamp: number;  // Unix timestamp
  close: number | null;
}
```

### RangeStats (레인지 계산 — HistoricalRates에서 파생)

```typescript
interface RangeStats {
  code: 'USD' | 'JPY' | 'CNY';
  avg1y: number;           // close 평균 (null 제외)
  position: number;        // (현재가 - 52wLow) / (52wHigh - 52wLow) × 100
  diffFromAvg: number;     // 현재가 - avg1y
  isCheap: boolean;        // diffFromAvg < 0
}
```

---

## 5. 캐싱 정책

| 데이터 | localStorage 키 | 유효 기간 |
|--------|----------------|----------|
| 현재 환율 (3종) | `exr_current` | 30분 (FX는 실시간에 가까움) |
| 과거 1년 데이터 | `exr_historical` | 당일 자정까지 |
| 마지막 fetch 시각 | `exr_last_fetch` | — |

```javascript
// 캐시 유효성 체크 패턴
function isCacheValid(key, ttlMs) {
  const cached = localStorage.getItem(key);
  if (!cached) return false;
  const { data, fetchedAt } = JSON.parse(cached);
  return (Date.now() - fetchedAt) < ttlMs;
}
```

---

## 6. 오픈 이슈

| ID | 이슈 | 확인 방법 | 우선순위 |
|----|------|---------|---------|
| OQ-01 | 브라우저에서 Yahoo Finance 직접 호출 시 CORS 차단 여부 | 배포 후 실제 브라우저에서 `fetch()` 테스트 | **높음** |
| OQ-02 | CORS 차단 시 대응: Netlify Edge Function proxy 또는 공개 CORS proxy 사용 | OQ-01 결과에 따라 결정 | OQ-01 이후 |
| OQ-03 | Yahoo Finance ToS — 개인 비상업적 사용 범위 내 여부 | 약관 검토 | 낮음 (개인 도구) |
