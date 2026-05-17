// Netlify serverless function — Yahoo Finance 프록시
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

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800', // 30분 캐시
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const range = event.queryStringParameters?.range || '1y';
  const type = event.queryStringParameters?.type || 'current'; // 'current' | 'history'

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
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, data: results }),
      };
    }

    if (type === 'history') {
      const jsons = await Promise.all(
        SYMBOLS.map(s => httpsGet(`/v8/finance/chart/${s}?interval=1d&range=${range}`))
      );
      const results = jsons.map((json, i) => {
        const result = json.chart.result[0];
        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        const data = timestamps
          .map((ts, j) => ({ ts, close: closes[j] }))
          .filter(d => d.close != null);
        return { symbol: SYMBOLS[i], data };
      });
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=43200' },
        body: JSON.stringify({ ok: true, data: results }),
      };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'invalid type' }) };

  } catch (err) {
    console.error('rates function error:', err);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
