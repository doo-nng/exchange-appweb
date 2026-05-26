# 환율 알림 기능 설계

**날짜:** 2026-05-26
**범위:** index.html + netlify/functions/ + sw.js + netlify.toml 수정

---

## 1. 기능 개요

목표 환율을 설정해두면, 해당 가격에 도달했을 때 백그라운드 푸시 알림을 받는 기능.
개인용 도구, 사용자 1명.

---

## 2. UX 흐름

### 목표 설정
1. 환율 카드(USD / JPY / CNY) 탭
2. 해당 통화 알림 설정 다이얼로그 등장
   - `active: false` 상태(이전 달성)이면 이전 목표가를 입력창에 pre-fill
   - 설정된 적 없으면 빈 입력창
3. 목표가 입력 (숫자만)
4. 방향 **자동 감지**: 목표가 < 현재가 → "이하", 목표가 > 현재가 → "이상"
5. 저장 버튼
   - 알림 권한 미허용 → 권한 요청 팝업
     - **허용**: 구독 생성 후 Netlify Blobs에 저장, 배지 표시
     - **거부**: 저장하지 않고 다이얼로그 닫힘. 인라인 메시지: *"알림을 허용해야 사용할 수 있어요"*
   - 이미 허용 상태 → 바로 저장
6. 저장 완료 후 카드에 배지: `🔔 1,450이하`
7. 다이얼로그 내 **"알림 해제"** 버튼: 언제든 클릭 시 해당 통화 알림 삭제 (targets → null)

### 알림 발동
- 목표 도달 시 기기로 푸시:
  ```
  💱 USD 1,448원 도달
  목표 1,450원 이하 달성 · 지금 확인해보세요
  ```
- 발동 후 해당 알림 **자동 해제** (`active: false`)
- 카드 배지: `🔔 1,450이하` → `✓ 달성` (흐리게 표시)
- 재설정하려면 카드를 다시 탭 (이전 목표가 pre-fill)

### 알림 클릭 (notificationclick)
- 이미 열린 앱 탭이 있으면 해당 탭 포커스
- 없으면 새 탭으로 `/` 열기 (`clients.openWindow('/')`)

### iOS 안내
알림 설정 시 안내 문구 표시:
> "아이폰에서는 홈 화면에 추가(PWA)된 상태에서만 푸시 알림이 동작합니다"

### SW 미지원 환경
Service Worker 등록 실패 시 (HTTP 환경 등) 알림 설정 UI 전체 숨김.

---

## 3. 기술 아키텍처

```
[페이지 로드]
  └── get-alert 함수 호출 → Blobs에서 현재 targets 조회
      → localStorage 캐시 업데이트 → 카드 배지 렌더

[목표 저장]
  └── save-alert 함수 → Blobs에 { subscription, targets } 저장
      → localStorage 캐시 업데이트

[스케줄 체크] 평일 00:00~09:00 UTC (KST 09:00~18:00), 매시간
  └── check-alerts 함수
      ├── Blobs에서 데이터 조회
      ├── active targets 없으면 즉시 200 반환 (빈 실행)
      ├── 현재 환율 조회 (Yahoo Finance, rates.js와 동일 소스)
      ├── 목표 달성 여부 체크
      ├── 달성 시 web-push로 푸시 전송
      └── 달성한 항목 active: false로 Blobs 업데이트
```

### 클라이언트 상태 로딩
- 페이지 로드 시 `get-alert` 함수 호출 → 현재 targets를 받아 배지 렌더
- 저장/해제 시 localStorage에도 동기화 (네트워크 실패 시 fallback)
- localStorage만 있고 서버 데이터가 없으면 무시 (단방향 캐시)

### 스케줄 cron (UTC 기준)
```
평일 KST 09:00~18:00 = UTC 00:00~09:00
cron: "0 0-9 * * 1-5"
```

### 보안
`save-alert`는 공개 endpoint. 단일 사용자 개인 도구이므로 별도 인증 없음.
리스크 인지: 누군가 악의적으로 subscription을 덮어쓸 수 있음.
허용 가능한 리스크로 판단 (개인 도구, 민감 정보 없음).

---

## 4. 파일 구성

| 파일 | 변경 내용 |
|------|----------|
| `netlify/functions/save-alert.js` | 신규 — subscription + targets를 Netlify Blobs `alerts/user`에 저장 |
| `netlify/functions/get-alert.js` | 신규 — Blobs에서 현재 targets 조회 반환 |
| `netlify/functions/check-alerts.js` | 신규 — 스케줄 함수, 환율 체크 + 웹푸시 전송 |
| `index.html` | 수정 — 카드 탭 다이얼로그 UI, 배지 렌더, get-alert 호출 |
| `sw.js` | 수정 — `push` 이벤트 핸들러, `notificationclick` 핸들러 추가 |
| `netlify.toml` | 수정 — check-alerts 스케줄 추가 |
| `package.json` | 수정 — `web-push` 런타임 의존성 추가 |

### VAPID 키
- `web-push` 패키지로 one-time 생성 → Netlify 환경변수에 저장:
  - `VAPID_PUBLIC_KEY` — 클라이언트 `pushManager.subscribe(applicationServerKey)` 에 사용
  - `VAPID_PRIVATE_KEY` — 서버에서 푸시 전송 시 사용
  - `VAPID_SUBJECT` — `mailto:hb2i049@gmail.com`
- `web-push`는 `check-alerts.js`와 `save-alert.js`의 런타임 의존성

### netlify.toml 추가 블록
```toml
[functions.check-alerts]
  schedule = "0 0-9 * * 1-5"
```

---

## 5. 데이터 구조 (Netlify Blobs — store: `alerts`, key: `user`)

```json
{
  "subscription": { /* Web PushSubscription 객체 전체 */ },
  "targets": {
    "USD": { "price": 1450, "direction": "below", "active": true },
    "JPY": null,
    "CNY": null
  }
}
```

- `direction`: `"below"` (이하) | `"above"` (이상)
- `active: true` = 활성, `active: false` = 달성 후 해제 상태
- `null` = 설정 없음
- `active: false` 항목은 다이얼로그 재오픈 시 이전 price pre-fill에 사용, 이후 새로 저장하거나 "알림 해제"로 null 처리

---

## 6. 수용 기준

- [ ] 카드 탭 시 다이얼로그 열림 (PC + 모바일)
- [ ] 이전 설정값 있으면 다이얼로그에 pre-fill
- [ ] 알림 권한 거부 시 저장 안 되고 안내 메시지 표시
- [ ] 저장 후 카드에 배지 표시 (`🔔 1,450이하`)
- [ ] 페이지 재로드 후에도 배지 유지 (get-alert 호출로 복원)
- [ ] SW 미지원 환경에서 알림 UI 숨김
- [ ] 평일 KST 09~18시 매시간 check-alerts 실행
- [ ] active targets 없을 때 check-alerts 200 정상 반환
- [ ] 목표 달성 시 푸시 알림 전송
- [ ] 알림 탭 시 앱으로 이동 (기존 탭 포커스 or 새 탭)
- [ ] 달성 후 배지 `✓ 달성` 으로 변경
- [ ] "알림 해제" 버튼으로 명시적 삭제 가능
- [ ] iOS PWA 안내 문구 표시
