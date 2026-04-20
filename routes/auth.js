const express = require('express');
const crypto = require('crypto');

const { createSession, deleteSession } = require('../services/tableStorage');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

// POST /api/admin/login  { password }
router.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body || {};
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return res.status(500).json({ error: 'ADMIN_PASSWORD is not configured' });
    if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Password required' });

    // Constant-time compare
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) return res.status(401).json({ error: 'Invalid password' });

    const token = crypto.randomBytes(32).toString('hex');
    await createSession(token, TTL_MS);
    res.json({ token, expiresInMs: TTL_MS });
  } catch (err) {
    console.error('[POST /admin/login] error', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/logout — auth
router.post('/admin/logout', requireAuth, async (req, res) => {
  try {
    await deleteSession(req.session.rowKey);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /admin/logout] error', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
