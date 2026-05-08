/**
 * routes/agentRoutes.js
 * --------------------------------------------------------------------------
 * AI agent admin endpoints:
 *   GET  /api/admin/shortlist           — shortlisted registrations + screenings
 *   GET  /api/admin/flagged             — flagged (duplicate/spam/bot)
 *   POST /api/admin/rescreen            — re-run agent on selected (or pending) regs
 *   GET  /api/admin/agent-status        — last screened, in-flight, last error
 *   GET  /api/admin/settings            — read auto-approve settings
 *   PATCH /api/admin/settings           — update auto-approve settings
 * --------------------------------------------------------------------------
 */

const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const {
  listRegistrations,
  listAIScreenings,
  getAIScreening,
  getEventSettings,
  updateEventSettings
} = require('../services/tableStorage');
const {
  rescreenMany,
  getActiveScreenings
} = require('../services/aiScreeningService');
const { shapeRegistration } = require('./registrations');

const router = express.Router();

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';

function shapeScreening(s) {
  if (!s) return null;
  return {
    registrationId: s.registrationId,
    score: s.score,
    summary: s.summary,
    flags: s.flags,
    profileGroup: s.profileGroup,
    isDuplicate: s.isDuplicate,
    duplicateOf: s.duplicateOf,
    isSpam: s.isSpam,
    isBot: s.isBot,
    isShortlisted: s.isShortlisted,
    autoApproveCandidate: s.autoApproveCandidate,
    draftApprovalEmail: s.draftApprovalEmail,
    draftRejectionEmail: s.draftRejectionEmail,
    agentVersion: s.agentVersion,
    model: s.model,
    screenedAt: s.screenedAt
  };
}

async function joinedRegistrations() {
  const [regs, screenings] = await Promise.all([
    listRegistrations(EVENT_ID),
    listAIScreenings(EVENT_ID)
  ]);
  const byId = new Map();
  for (const s of screenings) byId.set(s.registrationId, s);
  return regs.map((r) => ({
    ...shapeRegistration(r),
    screening: shapeScreening(byId.get(r.rowKey)) || null
  }));
}

// GET /api/admin/shortlist — registrations where isShortlisted = true
router.get('/admin/shortlist', requireAuth, async (_req, res) => {
  try {
    const all = await joinedRegistrations();
    const list = all
      .filter((r) => r.isShortlisted && !r.isDuplicate && !r.isSpam && !r.isBot)
      .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    res.json({ shortlist: list });
  } catch (err) {
    console.error('[GET /admin/shortlist] error', err);
    res.status(500).json({ error: 'Failed to load shortlist' });
  }
});

// GET /api/admin/flagged — registrations where duplicate/spam/bot
router.get('/admin/flagged', requireAuth, async (_req, res) => {
  try {
    const all = await joinedRegistrations();
    const list = all
      .filter((r) => r.isDuplicate || r.isSpam || r.isBot)
      .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
    res.json({ flagged: list });
  } catch (err) {
    console.error('[GET /admin/flagged] error', err);
    res.status(500).json({ error: 'Failed to load flagged' });
  }
});

// GET /api/admin/screening/:id — single screening (used by the draft-email modal)
router.get('/admin/screening/:id', requireAuth, async (req, res) => {
  try {
    const s = await getAIScreening(EVENT_ID, req.params.id);
    if (!s) return res.status(404).json({ error: 'No screening yet for this registration' });
    res.json({ screening: shapeScreening(s) });
  } catch (err) {
    console.error('[GET /admin/screening/:id] error', err);
    res.status(500).json({ error: 'Failed to load screening' });
  }
});

// POST /api/admin/rescreen
router.post('/admin/rescreen', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.registrationIds) ? req.body.registrationIds : [];
    const result = await rescreenMany(EVENT_ID, ids, { delayMs: 200 });
    res.json(result);
  } catch (err) {
    console.error('[POST /admin/rescreen] error', err);
    res.status(500).json({ error: 'Re-screen failed' });
  }
});

// GET /api/admin/agent-status
router.get('/admin/agent-status', requireAuth, async (_req, res) => {
  try {
    const [screenings, settings] = await Promise.all([
      listAIScreenings(EVENT_ID),
      getEventSettings(EVENT_ID)
    ]);
    let lastScreenedAt = '';
    for (const s of screenings) {
      if (s.screenedAt && s.screenedAt > lastScreenedAt) lastScreenedAt = s.screenedAt;
    }
    const totalRegs = (await listRegistrations(EVENT_ID)).length;
    const pendingScreenings = Math.max(0, totalRegs - screenings.length) + getActiveScreenings();
    res.json({
      lastScreenedAt,
      pendingScreenings,
      activeNow: getActiveScreenings(),
      lastError: settings.lastAgentError || null,
      lastErrorAt: settings.lastAgentErrorAt || null,
      agentVersion: 'v1.0',
      model: 'gpt-4o-mini'
    });
  } catch (err) {
    console.error('[GET /admin/agent-status] error', err);
    res.status(500).json({ error: 'Failed to load agent status' });
  }
});

// GET /api/admin/settings
router.get('/admin/settings', requireAuth, async (_req, res) => {
  try {
    const settings = await getEventSettings(EVENT_ID);
    res.json({
      autoApproveEnabled: !!settings.autoApproveEnabled,
      autoApproveThreshold: Number(settings.autoApproveThreshold) || 8
    });
  } catch (err) {
    console.error('[GET /admin/settings] error', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PATCH /api/admin/settings
router.patch('/admin/settings', requireAuth, async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body?.autoApproveEnabled === 'boolean') {
      patch.autoApproveEnabled = req.body.autoApproveEnabled;
    }
    if (typeof req.body?.autoApproveThreshold === 'number') {
      const t = Math.round(req.body.autoApproveThreshold);
      if (t < 7 || t > 10) {
        return res.status(400).json({ error: 'autoApproveThreshold must be between 7 and 10' });
      }
      patch.autoApproveThreshold = t;
    }
    const updated = await updateEventSettings(EVENT_ID, patch);
    res.json({
      autoApproveEnabled: !!updated.autoApproveEnabled,
      autoApproveThreshold: Number(updated.autoApproveThreshold) || 8
    });
  } catch (err) {
    console.error('[PATCH /admin/settings] error', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
