const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { getRegistration, updateRegistration } = require('../services/tableStorage');
const { generateQrBase64 } = require('../services/qrService');
const { sendApprovalEmail, sendRejectionEmail } = require('../services/emailService');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';
const EVENT_NAME = process.env.EVENT_NAME || 'DevPass 2025';
const EVENT_DATE = process.env.EVENT_DATE || '';
const EVENT_VENUE = process.env.EVENT_VENUE || '';

// POST /api/admin/approve/:id
router.post('/admin/approve/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const reg = await getRegistration(EVENT_ID, id);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    if (reg.status === 'approved') return res.status(409).json({ error: 'Already approved' });

    const qrToken = uuidv4();
    const now = new Date().toISOString();

    const updated = {
      partitionKey: EVENT_ID,
      rowKey: id,
      status: 'approved',
      qrToken,
      decidedAt: now
    };
    await updateRegistration(updated);

    // Generate QR and send email — failure should still leave DB consistent, but report error
    try {
      const payload = { id, token: qrToken, event: EVENT_ID };
      const qrBase64 = await generateQrBase64(payload);
      await sendApprovalEmail({
        to: reg.email,
        name: reg.name,
        eventName: EVENT_NAME,
        eventDate: EVENT_DATE,
        eventVenue: EVENT_VENUE,
        qrBase64
      });
    } catch (mailErr) {
      console.error('[approve] email send failed', mailErr);
      return res.status(502).json({
        error: 'Approved in DB but email failed. You can retry.',
        emailError: mailErr.message
      });
    }

    res.json({ ok: true, id, status: 'approved' });
  } catch (err) {
    console.error('[POST /admin/approve] error', err);
    res.status(500).json({ error: 'Failed to approve registration' });
  }
});

// POST /api/admin/reject/:id
router.post('/admin/reject/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const reg = await getRegistration(EVENT_ID, id);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    if (reg.status === 'rejected') return res.status(409).json({ error: 'Already rejected' });

    const now = new Date().toISOString();
    await updateRegistration({
      partitionKey: EVENT_ID,
      rowKey: id,
      status: 'rejected',
      decidedAt: now
    });

    try {
      await sendRejectionEmail({ to: reg.email, name: reg.name, eventName: EVENT_NAME });
    } catch (mailErr) {
      console.error('[reject] email send failed', mailErr);
      return res.status(502).json({
        error: 'Rejected in DB but email failed.',
        emailError: mailErr.message
      });
    }

    res.json({ ok: true, id, status: 'rejected' });
  } catch (err) {
    console.error('[POST /admin/reject] error', err);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
});

module.exports = router;
