// Vercel serverless function — 환율 브리핑(뉴스) 조회
// Upstash `news:latest`(scripts/fetch-news.mjs가 하루 1회 갱신)를 반환.
const { redisGet } = require('../lib/redis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600'); // 10분 캐시

  try {
    const raw = await redisGet('news:latest');
    res.status(200).json({ ok: true, news: raw ? JSON.parse(raw) : null });
  } catch (err) {
    console.error('get-news error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
