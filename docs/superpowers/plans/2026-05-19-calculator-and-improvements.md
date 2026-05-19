# Calculator, Card Badges & Chart Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 금액 계산기(플로팅 팝오버), 환율 카드 배지 2개(전일 대비 + 1년 평균 대비), 차트 점 버그 수정을 단일 index.html 파일에 구현한다.

**Architecture:** 모든 변경은 `index.html` 한 파일 안의 `<style>`, `<body>`, `<script>` 영역에 순차적으로 가해진다. 테스트 프레임워크가 없으므로 각 태스크 완료 후 배포 사이트(`https://exchangewebapp.netlify.app`)에서 브라우저 수동 검증으로 대체한다. 변경마다 커밋 후 `git push`로 Netlify 자동 배포.

**Tech Stack:** Vanilla JS, Chart.js 4.4, single HTML file PWA, Netlify Functions(프록시)

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `index.html` — `<style>` | 카드 배지 CSS, 계산기 FAB·팝오버 CSS 추가 |
| `index.html` — `<body>` | 카드 배지 HTML(renderCard), 계산기 FAB·팝오버 HTML 추가 |
| `index.html` — `<script>` | 모듈 상태 변수, loadCurrentRates 수정, updateChart 수정, renderCard 수정, 계산기 JS 추가 |

---

## Task 1: 모듈 스코프 상태 변수 추가 + loadCurrentRates 수정

**Files:**
- Modify: `index.html` — `<script>` 상단 변수 선언부, `loadCurrentRates()` 함수

**배경:** 계산기가 최신 환율을 읽을 수 있도록 `currentRates` 모듈 변수가 필요. `isCalcOpen`은 새로고침 후 자동 재계산 트리거에 사용.

- [ ] **Step 1: `currentRates`, `isCalcOpen` 변수 선언 추가**

`index.html` 의 `<script>` 내, 기존 `let historicalData = {};` 아래에 추가:

```javascript
let currentRates = {};   // { USD: 1380.5, JPY: 9.12, CNY: 190.3 }
let isCalcOpen = false;
```

- [ ] **Step 2: `loadCurrentRates()` 에서 `currentRates` 갱신**

기존 `renderCard(d.code, meta, stats);` 호출 바로 아래에 추가:

```javascript
currentRates[d.code] = d.rate;
```

- [ ] **Step 3: 브라우저 콘솔에서 확인**

배포 후 콘솔에서:
```javascript
currentRates  // { USD: 1380.5, JPY: 9.12, CNY: 190.3 } 형태여야 함
```

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: add currentRates and isCalcOpen module state"
git push
```

---

## Task 2: 차트 — 점 버그 수정 + 툴팁 개선

**Files:**
- Modify: `index.html` — `updateChart()` 함수 내 `datasets` 생성 부분, `chartOptions` 내 tooltip 콜백

**배경:** `pointRadius: 0` 설정에도 점이 보이는 버그. 각 dataset에 `baseRate` 저장 후 tooltip에서 실제 환율 역산.

- [ ] **Step 1: dataset 생성 코드에 `pointBorderWidth`, `baseRate` 추가**

`updateChart()` 내 `datasets` 생성 블록에서 각 currency 객체 return 부분 수정:

```javascript
const base = filtered[0].close;
return {
  label: cur.code,
  data: filtered.map(d => ({ x: d.ts * 1000, y: ((d.close - base) / base) * 100 })),
  borderColor: CHART_COLORS[cur.code],
  borderWidth: 2,
  pointRadius: 0,
  pointBorderWidth: 0,
  pointHoverRadius: 5,
  pointHoverBackgroundColor: CHART_COLORS[cur.code],
  tension: 0.3,
  fill: false,
  baseRate: base,   // ← 추가: 툴팁 역산용
};
```

- [ ] **Step 2: tooltip `label` 콜백 수정**

`chartOptions.plugins.tooltip.callbacks` 내 `label` 함수 교체:

```javascript
label: item => {
  const pct = item.parsed.y;
  const base = item.dataset.baseRate;
  const code = item.dataset.label;
  const decimals = code === 'JPY' ? 3 : 2;
  const actualRate = base * (1 + pct / 100);
  const sign = pct >= 0 ? '+' : '';
  return ` ${code}: ${sign}${pct.toFixed(2)}% · ${fmt(actualRate, decimals)}원`;
},
```

- [ ] **Step 3: 커밋 및 배포 후 브라우저 검증**

배포 후:
- 차트 선에 점이 없어야 함
- 선 위에 커서 올리면 점 + 툴팁 표시
- 툴팁 예시: `USD: +1.23% · 1,382.40원`

```bash
git add index.html
git commit -m "fix: chart dots removed, tooltip shows actual rate"
git push
```

---

## Task 3: 카드 배지 CSS 추가

**Files:**
- Modify: `index.html` — `<style>` 내 카드 관련 CSS 섹션

**배경:** 기존 `.change-badge` 는 제거되므로, 새 `.stat-badges` 레이아웃 CSS 추가.

- [ ] **Step 1: 기존 `.change-badge` CSS 규칙 제거**

`<style>` 에서 `.change-badge`, `.change-badge.rise`, `.change-badge.fall`, `.change-badge.neutral` 블록 전체 삭제.

- [ ] **Step 2: 새 배지 CSS 추가**

`<style>` 내 `.card-rate-unit` 규칙 바로 아래에 추가:

```css
/* 배지 2개 행 */
.stat-badges {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.stat-badge-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.badge-label {
  font-size: 10px;
  color: var(--text-tertiary);
}
.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}
.stat-badge.rise  { color: var(--rise); background: #FEF2F2; }
.stat-badge.fall  { color: var(--fall); background: #EFF6FF; }
.stat-badge.cheap { color: var(--fall); background: #EFF6FF; }
.stat-badge.exp   { color: var(--rise); background: #FEF2F2; }
.stat-badge.neutral { color: var(--neutral); background: #F9FAFB; }
/* skeleton용 */
.skeleton-badges { display: flex; gap: 10px; margin-bottom: 14px; }
.skeleton-badge  { height: 24px; width: 80px; }
```

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "style: add stat-badges CSS for dual card badges"
```

---

## Task 4: 카드 배지 JS — renderCard 수정

**Files:**
- Modify: `index.html` — `renderCard()` 함수

**배경:** 기존 `change-badge`(우상단 배지), `range-comment` 문장 제거. 배지 2개 블록으로 교체.

- [ ] **Step 1: 기존 skeleton HTML에서 배지 skeleton 추가**

`index.html` body 내 3개의 `.currency-card.loading` 블록 각각에서,  
기존:
```html
<div class="skeleton skeleton-rate"></div>
<div class="skeleton skeleton-bar"></div>
<div class="skeleton skeleton-text"></div>
```
를 아래로 교체:
```html
<div class="skeleton skeleton-rate"></div>
<div class="skeleton-badges">
  <div class="skeleton skeleton-badge"></div>
  <div class="skeleton skeleton-badge"></div>
</div>
<div class="skeleton skeleton-bar"></div>
```

- [ ] **Step 2: `renderCard()` 함수 내 변수 계산 블록 수정**

기존 (`renderCard` 내 change 관련 변수 4줄):
```javascript
const isRise = change > 0.001;
const isFall = change < -0.001;
const changeClass = isRise ? 'rise' : isFall ? 'fall' : 'neutral';
const arrow = isRise ? '▲' : isFall ? '▼' : '─';
```
`changeClass`와 `arrow`는 유지. 이후 `card.innerHTML`에서 `change-badge` div를 통째로 제거하므로 별도 변수 삭제는 없음.

- [ ] **Step 3: `renderCard()` 내 `rangeHtml` 생성 블록에서 comment 제거**

기존 `rangeHtml` 내 `comment` 문자열 생성 코드와 `${comment ? ...}` 부분 삭제.  
`range-comment` div 라인 제거. 레인지 바(track, marker, labels)는 유지.

- [ ] **Step 4: `renderCard()` 내 card.innerHTML 교체**

기존 `card.innerHTML` 문자열에서:
- `change-badge` div 블록 → 새 `.stat-badges` 블록으로 교체
- `card-rate-unit` 아래, 레인지 섹션 위에 배지 2개 삽입

`card.innerHTML` 의 카드 상단부터 rate-unit까지:

```javascript
// 전일 대비 배지
const dayBadgeClass = isRise ? 'rise' : isFall ? 'fall' : 'neutral';
const daySign = isRise ? '▲' : isFall ? '▼' : '─';
const dayBadgeHtml = `
  <div class="stat-badge-block">
    <span class="badge-label">전일 대비</span>
    <span class="stat-badge ${dayBadgeClass}">${daySign} ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>
  </div>`;

// 1년 평균 대비 배지 (데이터 충분할 때만)
let avgBadgeHtml = '';
if (stats && stats.avg != null) {
  const isCheap = rate < stats.avg;
  const diffDecimals = code === 'JPY' ? 3 : 2;
  const diff = Math.abs(rate - stats.avg).toFixed(diffDecimals);
  const avgClass = isCheap ? 'cheap' : 'exp';
  const avgArrow = isCheap ? '▼' : '▲';
  const avgLabel = isCheap ? '저렴' : '비쌈';
  avgBadgeHtml = `
    <div class="stat-badge-block">
      <span class="badge-label">1년 평균 대비</span>
      <span class="stat-badge ${avgClass}">${avgArrow} ${diff}원 ${avgLabel}</span>
    </div>`;
}
```

그리고 `card.innerHTML` 문자열에서 기존 `change-badge` div 대신:

```html
<div class="card-top">
  <div class="card-currency">
    <span class="flag">${cur.flag}</span>
    <div>
      <div class="currency-code">${cur.code}</div>
      <div class="currency-name">${cur.name}</div>
    </div>
  </div>
</div>
<div class="card-rate">${fmt(rate, decimals)}</div>
<div class="card-rate-unit">${cur.unit}</div>
<div class="stat-badges">
  ${dayBadgeHtml}
  ${avgBadgeHtml}
</div>
${rangeHtml}
<div class="card-footer">
  <div class="card-source">Yahoo Finance · FX 시장 기준</div>
  <div class="card-disclaimer">실제 환전 시 은행 스프레드 별도</div>
</div>
```

- [ ] **Step 5: 배포 후 브라우저 검증**

- 카드 우상단 배지 없음 (기존 배지 제거됨)
- 큰 환율 숫자 바로 아래 배지 2개 나란히 표시
- "전일 대비" 레이블 + % 배지
- "1년 평균 대비" 레이블 + 원 배지 (데이터 없으면 없음)
- 레인지 바 정상 표시, 코멘트 문장 없음
- 로딩 중 skeleton 2개 표시

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: replace card badge with dual stat-badges (전일/평균 대비)"
git push
```

---

## Task 5: 계산기 CSS 추가

**Files:**
- Modify: `index.html` — `<style>` 내 토스트 규칙 아래에 추가

- [ ] **Step 1: FAB + 팝오버 CSS 추가**

`<style>` 내 `.toast.show` 규칙 바로 아래에 추가:

```css
/* 계산기 FAB */
.calc-fab {
  position: fixed;
  bottom: 24px;
  right: 20px;
  z-index: 200;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(37,99,235,0.4);
  transition: background 0.15s, transform 0.15s;
}
.calc-fab:hover { background: #1D4ED8; }
.calc-fab.open { background: #6B7280; }

/* 계산기 팝오버 */
.calc-popover {
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 201;
  width: 300px;
  max-width: calc(100vw - 40px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  display: none;
}
.calc-popover.open { display: block; }

.calc-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

/* 통화 탭 */
.calc-tabs {
  display: flex;
  background: var(--bg-base);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
  margin-bottom: 14px;
}
.calc-tab {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.calc-tab.active { background: var(--accent); color: white; }

/* 입력 필드 행 */
.calc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.calc-field-label {
  font-size: 11px;
  color: var(--text-tertiary);
}
.calc-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-base);
  outline: none;
  transition: border-color 0.15s;
}
.calc-input:focus { border-color: var(--accent); background: white; }
.calc-input[readonly] { color: var(--text-secondary); font-weight: 500; }

/* 스왑 버튼 */
.calc-swap {
  display: flex;
  justify-content: center;
  margin: 6px 0;
}
.calc-swap-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 14px;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.1s;
}
.calc-swap-btn:hover { background: var(--bg-base); }

.calc-notice {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
  margin-top: 8px;
}
.calc-loading {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  padding: 16px 0;
}
```

- [ ] **Step 2: 커밋**

```bash
git add index.html
git commit -m "style: add calculator FAB and popover CSS"
```

---

## Task 6: 계산기 HTML 추가

**Files:**
- Modify: `index.html` — `<body>` 내 토스트 div 아래에 추가

- [ ] **Step 1: FAB 버튼 + 팝오버 HTML 삽입**

`index.html` 의 `<!-- 토스트 -->` 블록 바로 아래에 추가:

```html
<!-- 계산기 FAB -->
<button class="calc-fab" id="calc-fab" aria-label="환전 계산기 열기">💱</button>

<!-- 계산기 팝오버 -->
<div class="calc-popover" id="calc-popover" role="dialog" aria-label="환전 계산기">
  <div class="calc-title">💱 환전 계산기</div>
  <div class="calc-tabs" role="tablist">
    <button class="calc-tab active" role="tab" data-code="USD" onclick="calcSelectTab(this)">USD</button>
    <button class="calc-tab" role="tab" data-code="JPY" onclick="calcSelectTab(this)">JPY</button>
    <button class="calc-tab" role="tab" data-code="CNY" onclick="calcSelectTab(this)">CNY</button>
  </div>
  <div id="calc-body">
    <!-- JS로 채움 -->
  </div>
</div>
```

- [ ] **Step 2: 커밋**

```bash
git add index.html
git commit -m "feat: add calculator FAB and popover HTML structure"
```

---

## Task 7: 계산기 JavaScript 구현

**Files:**
- Modify: `index.html` — `<script>` 내 마지막 부분 (초기화 IIFE 위)

**배경:** 계산기 전체 동작 로직. `currentRates` 는 Task 1에서 이미 갱신되고 있음.

- [ ] **Step 1: 계산기 상태 + 핵심 계산 함수 추가**

`<script>` 내 `// ─── 초기화` 주석 바로 위에 추가:

```javascript
// ─── 계산기 ──────────────────────────────────────────
let calcActiveCode = 'USD';  // 현재 선택 통화
let calcDirection = 'krw';   // 'krw': 원화→외화 / 'foreign': 외화→원화

const CALC_DECIMALS = { USD: 2, JPY: 0, CNY: 2 };
const CALC_UNIT = { USD: '달러', JPY: '엔', CNY: '위안' };

function getCalcRate(code) {
  const rate = currentRates[code];
  if (!rate) return null;
  // JPY: 수출입은행 고시는 100엔 기준 → 1엔 기준으로 변환
  return code === 'JPY' ? rate / 100 : rate;
}

function calcConvert(inputVal, fromKrw) {
  const rate = getCalcRate(calcActiveCode);
  if (!rate || isNaN(inputVal)) return '';
  const result = fromKrw ? inputVal / rate : inputVal * rate;
  if (fromKrw) {
    // 외화 출력
    return result.toLocaleString('ko-KR', {
      minimumFractionDigits: CALC_DECIMALS[calcActiveCode],
      maximumFractionDigits: CALC_DECIMALS[calcActiveCode],
    });
  } else {
    // 원화 출력 (정수 콤마)
    return Math.round(result).toLocaleString('ko-KR');
  }
}

function renderCalcBody() {
  const body = document.getElementById('calc-body');
  const rate = getCalcRate(calcActiveCode);
  if (!rate) {
    body.innerHTML = '<div class="calc-loading">환율을 불러오는 중입니다...</div>';
    return;
  }
  const unit = CALC_UNIT[calcActiveCode];
  const krwIsInput = calcDirection === 'krw';

  body.innerHTML = `
    <div class="calc-field">
      <div class="calc-field-label">원화 (KRW)</div>
      <input class="calc-input" id="calc-krw" type="text" inputmode="decimal"
        placeholder="0" ${krwIsInput ? '' : 'readonly'}
        oninput="onCalcInput('krw')" value="" />
    </div>
    <div class="calc-swap">
      <button class="calc-swap-btn" onclick="swapCalcDirection()" aria-label="입력 방향 전환">⇄</button>
    </div>
    <div class="calc-field">
      <div class="calc-field-label">${calcActiveCode} (${unit})</div>
      <input class="calc-input" id="calc-foreign" type="text" inputmode="decimal"
        placeholder="0" ${krwIsInput ? 'readonly' : ''}
        oninput="onCalcInput('foreign')" value="" />
    </div>
    <div class="calc-notice">Yahoo Finance 기준 · 실제 환전 시 스프레드 별도</div>
  `;
}

function onCalcInput(from) {
  const fromKrw = from === 'krw';
  const srcEl = document.getElementById(fromKrw ? 'calc-krw' : 'calc-foreign');
  const dstEl = document.getElementById(fromKrw ? 'calc-foreign' : 'calc-krw');
  // 숫자/점만 허용
  const raw = srcEl.value.replace(/[^0-9.]/g, '');
  srcEl.value = raw;
  const num = parseFloat(raw);
  dstEl.value = raw === '' ? '' : calcConvert(num, fromKrw);
}

function recalcCalc() {
  const krwEl = document.getElementById('calc-krw');
  const foreignEl = document.getElementById('calc-foreign');
  if (!krwEl || !foreignEl) return;
  const fromKrw = calcDirection === 'krw';
  const srcEl = fromKrw ? krwEl : foreignEl;
  const dstEl = fromKrw ? foreignEl : krwEl;
  const num = parseFloat(srcEl.value.replace(/[^0-9.]/g, ''));
  if (!isNaN(num) && srcEl.value !== '') {
    dstEl.value = calcConvert(num, fromKrw);
  }
}

function swapCalcDirection() {
  calcDirection = calcDirection === 'krw' ? 'foreign' : 'krw';
  // 현재 입력값 보존 후 재렌더링
  const krwVal = document.getElementById('calc-krw')?.value || '';
  const foreignVal = document.getElementById('calc-foreign')?.value || '';
  renderCalcBody();
  // 이전 출력값을 새 입력 필드로 이동
  const newInput = calcDirection === 'krw'
    ? document.getElementById('calc-krw')
    : document.getElementById('calc-foreign');
  const prevOutput = calcDirection === 'krw' ? foreignVal : krwVal;
  if (newInput) {
    newInput.value = prevOutput.replace(/,/g, '');
    newInput.focus();
    onCalcInput(calcDirection);
  }
}

function calcSelectTab(btn) {
  document.querySelectorAll('.calc-tab').forEach(b => {
    b.classList.remove('active');
    b.removeAttribute('aria-selected');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  calcActiveCode = btn.dataset.code;
  calcDirection = 'krw'; // 탭 전환 시 방향 초기화
  renderCalcBody();
}

function openCalc() {
  const popover = document.getElementById('calc-popover');
  const fab = document.getElementById('calc-fab');
  isCalcOpen = true;
  popover.classList.add('open');
  fab.classList.add('open');
  fab.textContent = '✕';
  fab.setAttribute('aria-label', '계산기 닫기');
  renderCalcBody();
}

function closeCalc() {
  const popover = document.getElementById('calc-popover');
  const fab = document.getElementById('calc-fab');
  isCalcOpen = false;
  popover.classList.remove('open');
  fab.classList.remove('open');
  fab.textContent = '💱';
  fab.setAttribute('aria-label', '환전 계산기 열기');
}

document.getElementById('calc-fab').addEventListener('click', () => {
  isCalcOpen ? closeCalc() : openCalc();
});

// 외부 클릭 시 닫힘
document.addEventListener('click', e => {
  if (isCalcOpen && !e.target.closest('#calc-fab, #calc-popover')) {
    closeCalc();
  }
});
```

- [ ] **Step 2: `refreshAll()` 완료 후 자동 재계산 추가**

기존 `refreshAll()` 함수 내 `finally` 블록에 추가:

```javascript
finally {
  btn.classList.remove('loading');
  btn.disabled = false;
  if (isCalcOpen) recalcCalc();  // ← 추가
}
```

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: calculator JS — toggle, tabs, bidirectional conversion, swap"
git push
```

---

## Task 8: 최종 검증

- [ ] **Step 1: 데스크톱 브라우저 검증**

배포 URL(`https://exchangewebapp.netlify.app`) 에서:
- [ ] 💱 FAB 버튼이 우하단에 고정 표시
- [ ] FAB 클릭 → 팝오버 열림, 버튼 ✕로 변환
- [ ] USD 탭 선택 → 원화 입력 → 달러 결과 표시
- [ ] ⇄ 누르면 방향 전환, 이전 값이 새 입력 필드로 이동
- [ ] JPY 탭 전환 → 값 재계산
- [ ] 팝오버 외부 클릭 → 닫힘
- [ ] 새로고침 버튼 클릭 후 계산기 열린 상태면 자동 재계산

- [ ] **Step 2: 모바일 뷰포트(375px) 검증**

Chrome DevTools → 375px 너비:
- [ ] 팝오버가 화면 밖으로 나가지 않음 (max-width 적용)
- [ ] 숫자 키보드 열림 (inputmode="decimal")

- [ ] **Step 3: 차트 검증**

- [ ] 평상시 선에 점 없음
- [ ] 커서 올리면 점 + `USD: +1.23% · 1,382원` 형식 툴팁
- [ ] 기간 탭 전환 후도 동일 동작

- [ ] **Step 4: 카드 배지 검증**

- [ ] 큰 환율 아래 배지 2개 (전일 대비, 1년 평균 대비) 나란히
- [ ] 각 배지에 레이블 표시
- [ ] 로딩 중 skeleton 2개 표시

- [ ] **Step 5: .gitignore에 .superpowers/ 추가**

```bash
echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm dir"
git push
```
