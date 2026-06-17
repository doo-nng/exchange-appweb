# 환율 알림 기능 설계

**최초 작성:** 2026-05-26 (Netlify 기준)
**개정:** 2026-06-17 — **Vercel 마이그레이션 반영**. 저장소 Netlify Blobs → Upstash Redis, 스케줄러 Netlify Scheduled Functions → GitHub Actions cron.
**범위:** index.html + api/ + scripts/ + .github/workflows/ + sw.js

---

## 1. 기능 개요

목표 환율을 설정해두면, 해당 가격에 도달했을 때 백그라운드 푸시 알림을 받는 기능.
개인용 도구, 사용자 1명.

> 핵심 제약: 휴대폰 PWA는 닫혀 있을 때 백그라운드에서 환율을 감시하지 못한다. 따라서 항상 켜져 있는 서버(여기선 GitHub Actions)가 주기적으로 환율을 확인하고, 도달 시 Web Push로 기기에 알림을 보낸다.

---

## 2. UX 흐름

### 목표 설정
1. 환율 카드(USD / JPY / CNY) 탭 → 알림 설정 모달 등장
2. 이전 목표가가 있으면 입력창에 pre-fill, 없으면 빈 입력창
3. 목표가 입력 (숫자만)
4. 방향 **자동 감지**: 목표가 ≤ 현재가 → "이하", 목표가 > 현재가 → "이상"
5. 저장 버튼
   - 알림 권한 미허용 → 권한 요청. **허용**: 구독 생성 후 Upstash에 저장 + 배지 표시. **거부**: 저장 안 함, 인라인 메시지 *"알림을 허용해야 사용할 수 있어요"*
   - 이미 허용 상태 → 바로 저장
6. 저장 후 카드 배지: `🔔 1,450 이하`
7. 모달 내 **"알림 해제"** 버튼: 해당 통화 알림 삭제 (target → null)

### 알림 발동
- 목표 도달 시 기기로 푸시:
  ```
  💱 USD 1,448원 도달
  목표 1,450원 이하 달성 · 지금 확인해보세요
  ```
- 발동 후 해당 알림 **자동 해제** (`active: false`)
- 카드 배지: `🔔 1,450 이하` → `✓ 달성` (흐리게)

### 알림 클릭 (notificationclick)
- 이미 열린 앱 탭이 있으면 포커스, 없으면 새 탭으로 `/` 열기

### iOS 안내 / SW 미지원
- 모달에 항상 안내: *"아이폰은 홈 화면에 추가(PWA)한 상태에서만 알림이 동작합니다"*
- `serviceWorker`/`PushManager`/`Notification` 미지원 환경: 카드 탭 시 토스트로 안내, 모달 열지 않음

---

## 3. 기술 아키텍처

```
[페이지 로드]
  └── GET /api/get-alert → Upstash에서 targets 조회 → 카드 배지 렌더

[목표 저장/해제]
  └── POST /api/save-alert → Upstash에 { subscription, targets } 저장

[스케줄 체크] 평일 KST 09:00~18:00, 매시간 (GitHub Actions cron)
  └── scripts/check-alerts.mjs
      ├── Upstash에서 record 조회
      ├── active target 없으면 즉시 종료
      ├── Yahoo Finance 현재가 조회 (api/rates.js와 동일 소스)
      ├── 목표 달성 여부 체크 (below: rate ≤ price / above: rate ≥ price)
      ├── 달성 시 web-push 전송
      └── 달성 항목 active:false 로 Upstash 갱신 (만료 구독은 정리)
```

### 스케줄 cron (UTC 기준)
```
평일 KST 09:00~18:00 = UTC 00:00~09:00 → cron: "0 0-9 * * 1-5"
```
GitHub Actions cron은 부하에 따라 수 분 지연 가능 (개인 도구라 허용 범위). 무료.

### 보안
- `/api/save-alert`는 공개 endpoint, 단일 사용자 개인 도구라 별도 인증 없음. 악의적 덮어쓰기 리스크는 허용 가능으로 판단(민감 정보 없음).
- VAPID **private key**와 Upstash 토큰은 GitHub Actions Secrets에만 보관, 클라이언트 미노출.
- VAPID **public key**만 클라이언트(index.html)에 하드코딩 (원래 공개값).

---

## 4. 파일 구성

| 파일 | 변경 내용 |
|------|----------|
| `api/save-alert.js` | 신규 — subscription + target을 Upstash에 저장 / 해제 |
| `api/get-alert.js` | 신규 — Upstash에서 targets 조회 반환 (subscription 미노출) |
| `lib/redis.js` | 신규 — Upstash REST 헬퍼 (위 두 함수가 공유) |
| `scripts/check-alerts.mjs` | 신규 — 스케줄 체크 + web-push 전송 (GitHub Actions 실행) |
| `.github/workflows/check-alerts.yml` | 신규 — cron 스케줄 |
| `index.html` | 수정 — 카드 탭 모달, 배지 렌더, get/save-alert 호출, 구독 플로우 |
| `sw.js` | 수정 — `push` / `notificationclick` 핸들러 (캐시 v6) |
| `package.json` | 수정 — `web-push` 런타임 의존성 |

### 환경변수 / 시크릿
- **GitHub Actions Secrets**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT(mailto:hb2i049@gmail.com)`
- **Vercel 환경변수**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (save/get-alert 함수용)

---

## 5. 데이터 구조 (Upstash Redis — key: `alerts:user`, 값: JSON 문자열)

```json
{
  "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
  "targets": {
    "USD": { "price": 1450, "direction": "below", "active": true },
    "JPY": null,
    "CNY": null
  }
}
```

- `direction`: `"below"`(이하) | `"above"`(이상)
- `active`: `true` 활성 / `false` 달성 후 해제 / `null` 설정 없음
- JPY는 Yahoo `JPYKRW=X`(1엔 기준, 원/엔)로 카드 표시·목표가 일관. (수출입은행 100엔 고시와 무관)

---

## 6. 수용 기준

- [ ] 카드 탭 시 모달 열림 (PC + 모바일)
- [ ] 이전 설정값 있으면 모달에 pre-fill
- [ ] 알림 권한 거부 시 저장 안 되고 안내 메시지 표시
- [ ] 저장 후 카드에 배지 표시 (`🔔 1,450 이하`)
- [ ] 페이지 재로드 후에도 배지 유지 (get-alert 복원)
- [ ] SW/Push 미지원 환경에서 모달 대신 안내 토스트
- [ ] 평일 KST 09~18시 매시간 check-alerts 실행 (GitHub Actions)
- [ ] active target 없을 때 check-alerts 빈 실행 정상 종료
- [ ] 목표 달성 시 푸시 전송 + active:false 갱신
- [ ] 알림 탭 시 앱으로 이동 (기존 탭 포커스 or 새 탭)
- [ ] 달성 후 배지 `✓ 달성` 으로 변경
- [ ] "알림 해제" 버튼으로 명시적 삭제 가능
- [ ] iOS PWA 안내 문구 표시
