// Upstash Redis REST 헬퍼 — api/save-alert, api/get-alert 가 공유 (CommonJS)
// 단일 사용자 도구이므로 모든 알림 상태를 키 1개(alerts:user)에 JSON으로 저장.
const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'alerts:user';

const EMPTY = { subscription: null, targets: { USD: null, JPY: null, CNY: null, MYR: null } };

async function redisCommand(cmd) {
  if (!BASE || !TOKEN) throw new Error('Upstash 환경변수(UPSTASH_REDIS_REST_URL/TOKEN) 미설정');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function getRecord() {
  const raw = await redisCommand(['GET', KEY]);
  if (!raw) return structuredClone(EMPTY);
  try {
    const parsed = JSON.parse(raw);
    return {
      subscription: parsed.subscription || null,
      targets: { ...EMPTY.targets, ...(parsed.targets || {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function setRecord(record) {
  await redisCommand(['SET', KEY, JSON.stringify(record)]);
}

module.exports = { getRecord, setRecord, KEY };
