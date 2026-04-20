const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { validateRegistration } = require('../utils/validation');
const { createRegistration, listRegistrations } = require('../services/tableStorage');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';

// POST /api/register — public
router.post('/register', async (req, res) => {
  try {
    const { data, errors, valid } = validateRegistration(req.body);
    if (!valid) return res.status(400).json({ error: 'Validation failed', fields: errors });

    const now = new Date().toISOString();
    const entity = {
      partitionKey: EVENT_ID,
      rowKey: uuidv4(),
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      company: data.company || '',
      role: data.role || 'other',
      linkedinUrl: data.linkedinUrl || '',
      githubUrl: data.githubUrl || '',
      whyAttend: data.whyAttend || '',
      status: 'pending',
      qrToken: '',
      checkedIn: false,
      registeredAt: now,
      decidedAt: ''
    };

    await createRegistration(entity);
    res.status(201).json({ ok: true, id: entity.rowKey });
  } catch (err) {
    console.error('[POST /register] error', err);
    res.status(500).json({ error: 'Failed to create registration' });
  }
});

// GET /api/admin/registrations — auth
router.get('/admin/registrations', requireAuth, async (req, res) => {
  try {
    const items = await listRegistrations(EVENT_ID);
    const payload = items.map((r) => ({
      id: r.rowKey,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      role: r.role,
      linkedinUrl: r.linkedinUrl,
      githubUrl: r.githubUrl,
      whyAttend: r.whyAttend,
      status: r.status,
      checkedIn: !!r.checkedIn,
      registeredAt: r.registeredAt,
      decidedAt: r.decidedAt
    }));
    res.json({ registrations: payload });
  } catch (err) {
    console.error('[GET /admin/registrations] error', err);
    res.status(500).json({ error: 'Failed to load registrations' });
  }
});

// GET /api/admin/stats — auth
router.get('/admin/stats', requireAuth, async (req, res) => {
  try {
    const items = await listRegistrations(EVENT_ID);
    const stats = { pending: 0, approved: 0, rejected: 0, checkedIn: 0, total: items.length };
    for (const r of items) {
      if (r.status === 'pending') stats.pending++;
      else if (r.status === 'approved') stats.approved++;
      else if (r.status === 'rejected') stats.rejected++;
      if (r.checkedIn) stats.checkedIn++;
    }
    res.json(stats);
  } catch (err) {
    console.error('[GET /admin/stats] error', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

module.exports = router;
