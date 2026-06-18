// 환율 브리핑 수집·요약 — GitHub Actions(cron, 하루 1회)에서 실행.
// 흐름: 당일 환율 변동(Yahoo) + 뉴스(네이버 API·RSS) 수집 → 키워드 필터/중복제거
//       → 어제 테마와 함께 GitHub Models(무료)에 전달 → 한국어 brief+themes JSON → Upstash news:latest 저장.
// 실패/빈 결과 시 직전 값을 덮어쓰지 않음. 외부 의존성 없음(내장 fetch + node:https만).
// AI 엔진: GitHub Models (Actions 내장 GITHUB_TOKEN + permissions:models:read, 진짜 0원).
import https from 'node:https';

const BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const GH_MODELS_TOKEN = process.env.GH_MODELS_TOKEN;
const GH_MODELS_MODEL = process.env.GH_MODELS_MODEL || 'openai/gpt-4o-mini';
const YAHOO_HOST = 'query2.finance.yahoo.com';
const SYMS = { USD: 'USDKRW=X', JPY: 'JPYKRW=X', CNY: 'CNYKRW=X', MYR: 'MYRKRW=X', DXY: 'DX-Y.NYB' };

const NAVER_QUERIES = ['환율', '원달러 환율', '연준 금리', '위안 환율', '엔화'];
const RSS_FEEDS = [
  { url: 'https://www.hankyung.com/feed/economy', source: '한국경제' },
  { url: 'https://www.hankyung.com/feed/finance', source: '한국경제' },
  { url: 'https://www.hankyung.com/feed/international', source: '한국경제' },
  { url: 'https://www.investinglive.com/feed/', source: 'investingLive' },
  { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet' },
];
const KW = /환율|달러|원화|원\/달러|엔화|엔화|위안|링깃|금리|연준|fed|fomc|한은|한국은행|ecb|boj|무역|경상|수출|외환|dxy|dollar|yen|yuan|ringgit|currency|forex|inflation|treasury/i;

// ─── Upstash ──────────────────────────────────────────
async function redis(cmd) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
  return (await r.json()).result;
}
async function getNews() {
  const raw = await redis(['GET', 'news:latest']);
  return raw ? JSON.parse(raw) : null;
}
async function setNews(rec) {
  await redis(['SET', 'news:latest', JSON.stringify(rec)]);
}

// ─── Yahoo 환율 변동 ──────────────────────────────────
function yahoo(symbol) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: YAHOO_HOST,
      path: `/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15', 'Accept': '*/*' },
    }, res => {
      if (res.statusCode !== 200) { reject(new Error(`Yahoo ${res.statusCode}`)); res.resume(); return; }
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function fetchRateMoves() {
  const out = [];
  for (const [code, sym] of Object.entries(SYMS)) {
    try {
      const m = (await yahoo(sym)).chart.result[0].meta;
      const pct = ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100;
      out.push({ code, pct: +pct.toFixed(2) });
    } catch (e) { /* 개별 실패 무시 */ }
  }
  return out;
}

// ─── 뉴스 수집 ────────────────────────────────────────
function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }
function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

async function fetchNaver() {
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const out = [];
  for (const q of NAVER_QUERIES) {
    try {
      const r = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=10&sort=date`,
        { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
      if (!r.ok) continue;
      const j = await r.json();
      (j.items || []).forEach(it => out.push({
        title: decodeEntities(stripTags(it.title)),
        url: it.originallink || it.link,
        source: '네이버',
        desc: decodeEntities(stripTags(it.description)),
      }));
    } catch (e) { /* 무시 */ }
  }
  return out;
}

function extractTag(blk, tag) {
  const m = blk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}
function parseRss(xml) {
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  return blocks.slice(0, 15).map(blk => ({
    title: decodeEntities(stripTags(extractTag(blk, 'title'))),
    link: extractTag(blk, 'link'),
    desc: decodeEntities(stripTags(extractTag(blk, 'description'))),
  })).filter(it => it.title && it.link);
}
async function fetchRss() {
  const out = [];
  for (const f of RSS_FEEDS) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) continue;
      parseRss(await r.text()).forEach(it => out.push({ title: it.title, url: it.link, source: f.source, desc: it.desc }));
    } catch (e) { /* 무시 */ }
  }
  return out;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.title || '').replace(/\s+/g, '').slice(0, 30);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ─── Gemini 요약 ──────────────────────────────────────
function buildPrompt(rates, prevThemes, news) {
  const moveStr = rates.map(r => `${r.code} ${r.pct >= 0 ? '▲' : '▼'}${Math.abs(r.pct)}%`).join(', ') || '(데이터 없음)';
  const prevStr = prevThemes.length ? prevThemes.map(t => `- ${t.title}: ${t.status} (${t.trend})`).join('\n') : '(없음)';
  const newsStr = news.map((n, i) => `${i + 1}. (${n.source}) ${n.title}`).join('\n');
  return `너는 한국 환율 대시보드의 애널리스트다. 아래 정보로 환율에 영향 주는 핵심만 한국어로 간결히 정리해라. 반드시 JSON만 출력한다.

[오늘 환율 변동]
${moveStr}

[어제 이슈 테마]
${prevStr}

[오늘 뉴스 헤드라인]
${newsStr}

규칙:
- brief.headline: 오늘 환율 상황 한 줄(25자 내외).
- brief.drivers: 움직임이 크거나 뉴스 근거가 있는 통화 위주 3~5개. code는 USD/JPY/CNY/MYR 중 하나. line은 "달러 ▲0.3% · 이유" 형식, 20자 내외.
- themes: 정확히 아래 5개를 이 순서/제목으로. status는 현황 1줄(15자 내외), trend는 [심화|지속|완화|진정] 중 하나. 어제 테마가 있으면 비교해 추세를 정하라.
  1) 미 연준·금리  2) 한국경제·한은  3) 중국 경기  4) 일본·BOJ  5) 원자재·신흥국
- 뉴스에 근거가 없으면 status는 "특이사항 없음", trend는 "지속".
- URL이나 없는 사실을 지어내지 마라.

출력 JSON 스키마:
{"brief":{"headline":"","drivers":[{"code":"USD","line":""}]},"themes":[{"title":"미 연준·금리","status":"","trend":"지속"}]}`;
}

async function callLLM(prompt) {
  const r = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_MODELS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GH_MODELS_MODEL,
      messages: [
        { role: 'system', content: '너는 한국 환율 대시보드의 애널리스트다. 반드시 유효한 JSON만 출력한다.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`GitHub Models HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('GitHub Models empty response');
  return JSON.parse(text);
}

// ─── 메인 ─────────────────────────────────────────────
async function main() {
  if (!GH_MODELS_TOKEN) { console.error('GH_MODELS_TOKEN 미설정'); process.exit(1); }

  const prev = await getNews();
  const rates = await fetchRateMoves();
  const rel = it => KW.test(`${it.title} ${it.desc || ''}`);
  const naverItems = (await fetchNaver()).filter(rel);
  const rssItems = (await fetchRss()).filter(rel);
  // RSS(한국경제·글로벌 FX) 우선 + 네이버는 캡 → 일반 증시 뉴스가 FX 드라이버 뉴스를 밀어내지 않게
  const collected = dedupe([...rssItems, ...naverItems.slice(0, 14)]);
  console.log(`collected ${collected.length} (rss ${rssItems.length}, naver ${naverItems.length}), ${rates.length} rate moves`);

  if (collected.length === 0) { console.log('수집된 뉴스 없음 — 직전 값 유지'); return; }

  const top = collected.slice(0, 25);
  let ai;
  try {
    ai = await callLLM(buildPrompt(rates, prev?.themes || [], top));
  } catch (e) {
    console.error('LLM 실패 — 직전 값 유지:', e.message);
    return;
  }

  const record = {
    updatedAt: new Date().toISOString(),
    brief: ai.brief || { headline: '', drivers: [] },
    themes: Array.isArray(ai.themes) ? ai.themes : [],
    sources: top.slice(0, 5).map(it => ({ title: it.title, source: it.source, url: it.url })),
  };
  await setNews(record);
  console.log(`news updated: "${record.brief.headline}" · themes ${record.themes.length} · sources ${record.sources.length}`);
}

main().catch(err => { console.error('fetch-news fatal:', err); process.exit(1); });
