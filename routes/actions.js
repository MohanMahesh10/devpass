const express = require('express');

const { approveRegistration, rejectRegistration } = require('../services/decisionService');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';

/**
 * Optional body on both endpoints:
 *   { customEmailBody?: string }
 * If customEmailBody is provided (e.g. organizer edited the AI draft),
 * it's used as the email body. Otherwise the default template is used.
 */

// POST /api/admin/approve/:id
router.post('/admin/approve/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const customEmailBody = typeof req.body?.customEmailBody === 'string' && req.body.customEmailBody.trim().length
    ? req.body.customEmailBody
    : undefined;
  try {
    const result = await approveRegistration(EVENT_ID, id, {
      actor: 'admin',
      customEmailBody
    });
    if (result.notFound) return res.status(404).json({ error: 'Registration not found' });
    if (result.alreadyDone) return res.status(409).json({ error: 'Already approved' });
    if (result.partial && result.emailError) {
      return res.status(502).json({
        error: 'Approved in DB but email failed. You can retry.',
        emailError: result.emailError
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
  const customEmailBody = typeof req.body?.customEmailBody === 'string' && req.body.customEmailBody.trim().length
    ? req.body.customEmailBody
    : undefined;
  try {
    const result = await rejectRegistration(EVENT_ID, id, {
      actor: 'admin',
      customEmailBody
    });
    if (result.notFound) return res.status(404).json({ error: 'Registration not found' });
    if (result.alreadyDone) return res.status(409).json({ error: 'Already rejected' });
    if (result.partial && result.emailError) {
      return res.status(502).json({
        error: 'Rejected in DB but email failed.',
        emailError: result.emailError
      });
    }
    res.json({ ok: true, id, status: 'rejected' });
  } catch (err) {
    console.error('[POST /admin/reject] error', err);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
});

module.exports = router;
