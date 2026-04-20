const express = require('express');
const { findByQrToken, updateRegistration } = require('../services/tableStorage');

const router = express.Router();

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';

/**
 * POST /api/checkin
 * Body: raw QR payload — either a JSON string { id, token, event } or { qr: "<string>" }
 * Public — no auth (volunteers scan on their phones).
 */
router.post('/checkin', async (req, res) => {
  try {
    let payload = req.body;
    if (payload && typeof payload.qr === 'string') {
      try { payload = JSON.parse(payload.qr); } catch (_) {
        return res.status(400).json({ status: 'invalid', error: 'Unreadable QR payload' });
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ status: 'invalid', error: 'Missing QR payload' });
    }

    const { id, token, event } = payload;
    if (!id || !token) return res.status(400).json({ status: 'invalid', error: 'Malformed QR' });
    if (event && event !== EVENT_ID) {
      return res.status(400).json({ status: 'invalid', error: 'QR not for this event' });
    }

    const reg = await findByQrToken(EVENT_ID, token);
    if (!reg || reg.rowKey !== id) {
      return res.status(404).json({ status: 'invalid', error: 'Unrecognised pass' });
    }
    if (reg.status !== 'approved') {
      return res.status(403).json({ status: 'invalid', error: 'Registration is not approved' });
    }

    if (reg.checkedIn) {
      return res.status(200).json({
        status: 'duplicate',
        name: reg.name,
        message: 'Already checked in'
      });
    }

    await updateRegistration({
      partitionKey: EVENT_ID,
      rowKey: id,
      checkedIn: true,
      checkedInAt: new Date().toISOString()
    });

    res.json({ status: 'success', name: reg.name, message: 'Entry confirmed' });
  } catch (err) {
    console.error('[POST /checkin] error', err);
    res.status(500).json({ status: 'error', error: 'Check-in failed' });
  }
});

module.exports = router;
