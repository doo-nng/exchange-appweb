// 스케줄 체크 스크립트 — GitHub Actions(cron)에서 실행.
// Upstash에서 목표 조회 → Yahoo Finance 현재가 조회 → 달성 시 web-push 전송 → 달성 항목 active:false.
// 환율 소스는 api/rates.js 와 동일(Yahoo). JPY는 1엔 기준(원/엔)으로 카드 표시와 일치.
import https from 'node:https';
import webpush from 'web-push';

const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'alerts:user';
const SYMBOLS = { USD: 'USDKRW=X', JPY: 'JPYKRW=X', CNY: 'CNYKRW=X', MYR: 'MYRKRW=X' };
const YAHOO_HOST = 'query2.finance.yahoo.com';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// ─── Upstash REST ─────────────────────────────────────
async function redis(cmd) {
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
  const raw = await redis(['GET', KEY]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function setRecord(record) {
  await redis(['SET', KEY, JSON.stringify(record)]);
}

// ─── Yahoo Finance 현재가 ─────────────────────────────
function yahooGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: YAHOO_HOST,
      path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': '*/*',
      },
    }, res => {
      if (res.statusCode !== 200) { reject(new Error(`Yahoo HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchRates() {
  const codes = Object.keys(SYMBOLS);
  const jsons = await Promise.all(
    codes.map(c => yahooGet(`/v8/finance/chart/${SYMBOLS[c]}?interval=1d&range=1d`)),
  );
  const out = {};
  jsons.forEach((json, i) => {
    out[codes[i]] = json.chart.result[0].meta.regularMarketPrice;
  });
  return out;
}

function fmt(n, decimals) {
  return Number(n).toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── 메인 ─────────────────────────────────────────────
async function main() {
  const record = await getRecord();
  if (!record || !record.targets) { console.log('no record'); return; }

  const active = Object.entries(record.targets).filter(([, t]) => t && t.active);
  if (!active.length) { console.log('no active targets'); return; }
  if (!record.subscription) { console.log('targets exist but no subscription'); return; }

  const rates = await fetchRates();
  let changed = false;
  const hits = [];

  for (const [code, t] of active) {
    const rate = rates[code];
    if (rate == null) continue;
    const met = t.direction === 'below' ? rate <= t.price : rate >= t.price;
    if (met) {
      hits.push({ code, target: t, rate });
      record.targets[code].active = false;
      changed = true;
    }
  }

  for (const h of hits) {
    const decimals = h.code === 'JPY' ? 3 : 2;
    const dirText = h.target.direction === 'below' ? '이하' : '이상';
    const payload = JSON.stringify({
      title: `💱 ${h.code} ${fmt(h.rate, decimals)}원 도달`,
      body: `목표 ${fmt(h.target.price, decimals)}원 ${dirText} 달성 · 지금 확인해보세요`,
      url: '/',
    });
    try {
      await webpush.sendNotification(record.subscription, payload);
      console.log(`push sent: ${h.code}`);
    } catch (e) {
      console.error(`push failed (${h.code}):`, e.statusCode, e.body || e.message);
      // 만료/삭제된 구독 → 정리
      if (e.statusCode === 404 || e.statusCode === 410) {
        record.subscription = null;
        changed = true;
      }
    }
  }

  if (changed) await setRecord(record);
  console.log(`checked ${active.length} target(s), ${hits.length} hit(s)`);
}

main().catch(err => {
  console.error('check-alerts fatal:', err);
  process.exit(1);
});
