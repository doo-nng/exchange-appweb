// Vercel serverless function — 알림 목표 저장/해제
// POST { subscription, code, price, direction }  → 목표 등록 (active: true)
// POST { code, remove: true }                    → 해당 통화 알림 해제 (null)
const { getRecord, setRecord } = require('../lib/redis');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }

  try {
    const { code, subscription, price, direction, remove } = await readBody(req);

    if (!['USD', 'JPY', 'CNY'].includes(code)) {
      res.status(400).json({ ok: false, error: 'invalid code' });
      return;
    }

    const record = await getRecord();

    if (remove) {
      record.targets[code] = null;
    } else {
      if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
        res.status(400).json({ ok: false, error: 'invalid price' });
        return;
      }
      if (!['below', 'above'].includes(direction)) {
        res.status(400).json({ ok: false, error: 'invalid direction' });
        return;
      }
      if (subscription && subscription.endpoint) record.subscription = subscription;
      if (!record.subscription) {
        res.status(400).json({ ok: false, error: 'no subscription' });
        return;
      }
      record.targets[code] = { price, direction, active: true };
    }

    await setRecord(record);
    res.status(200).json({ ok: true, targets: record.targets });
  } catch (err) {
    console.error('save-alert error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
