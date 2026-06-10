// Vercel serverless function — Yahoo Finance 프록시
// 브라우저 CORS 우회용. 서버에서 Yahoo Finance 호출 후 클라이언트에 반환.
// Node.js native fetch는 sec-fetch-mode:cors 헤더를 자동 추가해 rate limit 유발 → https 모듈 사용

const https = require('https');
const SYMBOLS = ['USDKRW=X', 'JPYKRW=X', 'CNYKRW=X'];
const YAHOO_HOST = 'query2.finance.yahoo.com';

function httpsGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: YAHOO_HOST,
      path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': '*/*',
      },
    }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const range = req.query.range || '1y';
  const type = req.query.type || 'current'; // 'current' | 'history'

  try {
    if (type === 'current') {
      const jsons = await Promise.all(
        SYMBOLS.map(s => httpsGet(`/v8/finance/chart/${s}?interval=1d&range=1d`))
      );
      const results = jsons.map((json, i) => {
        const meta = json.chart.result[0].meta;
        return {
          symbol: SYMBOLS[i],
          rate: meta.regularMarketPrice,
          prevClose: meta.chartPreviousClose,
          high52w: meta.fiftyTwoWeekHigh,
          low52w: meta.fiftyTwoWeekLow,
          updatedAt: meta.regularMarketTime,
        };
      });
      res.setHeader('Cache-Control', 'public, max-age=1800'); // 30분 캐시
      res.status(200).json({ ok: true, data: results });
      return;
    }

    if (type === 'history') {
      // CNYKRW=X는 Yahoo에서 직접 과거 데이터가 없음 → USDKRW ÷ USDCNY 크로스 계산
      const [usdkrwJson, jpykrwJson, usdcnyJson] = await Promise.all([
        httpsGet(`/v8/finance/chart/USDKRW=X?interval=1d&range=${range}`),
        httpsGet(`/v8/finance/chart/JPYKRW=X?interval=1d&range=${range}`),
        httpsGet(`/v8/finance/chart/USDCNY=X?interval=1d&range=${range}`),
      ]);

      function parseChart(json, symbol) {
        const result = json.chart.result[0];
        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        return timestamps
          .map((ts, i) => ({ ts, close: closes[i] }))
          .filter(d => d.close != null);
      }

      const usdkrw = parseChart(usdkrwJson, 'USDKRW=X');
      const jpykrw = parseChart(jpykrwJson, 'JPYKRW=X');
      const usdcny  = parseChart(usdcnyJson, 'USDCNY=X');

      // USDCNY를 타임스탬프 맵으로 변환 (날짜 단위로 매칭)
      const cnyMap = new Map(usdcny.map(d => [Math.floor(d.ts / 86400), d.close]));
      const cnykrw = usdkrw
        .map(d => {
          const day = Math.floor(d.ts / 86400);
          const usdcnyRate = cnyMap.get(day) || cnyMap.get(day - 1) || cnyMap.get(day + 1);
          if (!usdcnyRate) return null;
          return { ts: d.ts, close: d.close / usdcnyRate };
        })
        .filter(Boolean);

      const results = [
        { symbol: 'USDKRW=X', data: usdkrw },
        { symbol: 'JPYKRW=X', data: jpykrw },
        { symbol: 'CNYKRW=X', data: cnykrw },
      ];
      res.setHeader('Cache-Control', 'public, max-age=43200');
      res.status(200).json({ ok: true, data: results });
      return;
    }

    res.status(400).json({ error: 'invalid type' });

  } catch (err) {
    console.error('rates function error:', err);
    res.status(502).json({ ok: false, error: err.message });
  }
};
