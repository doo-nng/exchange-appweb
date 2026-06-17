// Vercel serverless function — 현재 알림 목표 조회 (카드 배지 복원용)
// 구독정보(subscription)는 클라이언트에 노출하지 않고 targets만 반환.
const { getRecord } = require('../lib/redis');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const record = await getRecord();
    res.status(200).json({ ok: true, targets: record.targets });
  } catch (err) {
    console.error('get-alert error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
