# 환율 알림 기능 설계

**날짜:** 2026-05-26
**범위:** index.html + netlify/functions/ 수정

---

## 1. 기능 개요

목표 환율을 설정해두면, 해당 가격에 도달했을 때 백그라운드 푸시 알림을 받는 기능.
개인용 도구로, 사용자는 1명.

---

## 2. UX 흐름

### 목표 설정
1. 환율 카드(USD / JPY / CNY) 탭
2. 해당 통화 알림 설정 다이얼로그 등장
3. 목표가 입력 (숫자만)
4. 방향 **자동 감지**: 목표가 < 현재가 → "이하", 목표가 > 현재가 → "이상"
5. 저장 버튼 → 알림 권한 요청 (미허용 시) → 서버에 저장
6. 설정 완료 후 카드에 배지 표시: `🔔 1,450이하`

### 알림 발동
- 목표 도달 시 기기로 푸시:
  ```
  💱 USD 1,448원 도달
  목표 1,450원 이하 달성 · 지금 확인해보세요
  ```
- 발동 후 해당 알림 **자동 해제**
- 카드 배지: `🔔 1,450이하` → `✓ 달성` (흐리게 표시)
- 재설정하려면 카드를 다시 탭

### iOS 안내
알림 설정 시 안내 문구 표시:
> "아이폰에서는 홈 화면에 추가(PWA)된 상태에서만 푸시 알림이 동작합니다"

---

## 3. 기술 아키텍처

```
[사용자 브라우저]                    [Netlify]
목표가 저장 ──── save-alert 함수 ──→ Netlify Blobs
(구독정보 포함)                     { subscription, targets: {USD, JPY, CNY} }

                     ↓ 평일 9-18시 매시간 (스케줄 함수)
              check-alerts 함수
              ├── Blobs에서 구독정보 + 목표가 조회
              ├── 현재 환율 조회 (Yahoo Finance)
              ├── 목표 달성 여부 체크
              ├── 달성 시 웹푸시 전송
              └── 달성한 알림 자동 삭제 (Blobs 업데이트)
```

### 체크 주기
- 평일(월~금) 오전 9시 ~ 오후 6시 KST, 매시간
- 하루 최대 9회 → 월 ~180회 (Netlify 무료 한도 125,000회 대비 여유)

---

## 4. 파일 구성

| 파일 | 변경 내용 |
|------|----------|
| `netlify/functions/save-alert.js` | 신규 — 구독정보 + 목표가를 Netlify Blobs에 저장 |
| `netlify/functions/check-alerts.js` | 신규 — 스케줄 함수, 환율 체크 + 웹푸시 전송 |
| `index.html` | 수정 — 카드 탭 다이얼로그 UI, SW 푸시 수신 로직, 배지 상태 표시 |
| `sw.js` | 수정 — `push` 이벤트 핸들러, `notificationclick` 핸들러 추가 |
| `netlify.toml` | 수정 — check-alerts 스케줄 설정 추가 |

### VAPID 키
- `web-push` npm 패키지로 one-time 생성
- Netlify 환경변수로 저장: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

---

## 5. 데이터 구조 (Netlify Blobs)

```json
{
  "subscription": { /* PushSubscription 객체 */ },
  "targets": {
    "USD": { "price": 1450, "direction": "below", "active": true },
    "JPY": null,
    "CNY": null
  }
}
```

- `direction`: `"below"` (이하) | `"above"` (이상)
- `active: false` = 달성 후 자동 해제 상태

---

## 6. 수용 기준

- 카드 탭 시 다이얼로그 열림 (PC + 모바일 모두)
- 목표가 저장 시 알림 권한 요청
- 설정 후 카드에 배지 표시
- 평일 9-18시 매시간 체크
- 목표 달성 시 푸시 알림 전송
- 알림 탭 시 앱으로 이동
- 달성 후 자동 해제 + 배지 상태 변경
- iOS PWA 안내 문구 표시
