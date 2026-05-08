/**
 * services/aiScreeningService.js
 * --------------------------------------------------------------------------
 * Wraps the agentic pipeline (services/agentPipeline.js) with persistence
 * and side-effects:
 *   - run agent on a registration (fetch existing regs first for dedup)
 *   - save full result to AIScreenings table
 *   - copy summary fields back to the Registrations row for fast querying
 *   - if event has autoApproveEnabled and result is an autoApproveCandidate
 *     above the configured threshold, auto-approve and log it
 *
 * Public API:
 *   - screenRegistration(eventId, registrationId) — async, full pipeline + persist
 *   - triggerScreening(eventId, registrationId)   — fire-and-forget wrapper
 *                                                   (uses setImmediate, never throws)
 * --------------------------------------------------------------------------
 */

const {
  listRegistrations,
  getRegistration,
  updateRegistration,
  saveAIScreening,
  getAIScreening,
  getEventSettings,
  updateEventSettings
} = require('./tableStorage');
const { runAgentPipeline, AGENT_VERSION } = require('./agentPipeline');
const { approveRegistration } = require('./decisionService');

let activeScreenings = 0;

function getActiveScreenings() {
  return activeScreenings;
}

/**
 * Run the agent on a single registration, persist results, optionally auto-approve.
 * Returns the AIScreening result object.
 */
async function screenRegistration(eventId, registrationId, opts = {}) {
  activeScreenings += 1;
  try {
    const reg = opts.registration || await getRegistration(eventId, registrationId);
    if (!reg) {
      console.warn('[aiScreening] registration not found', eventId, registrationId);
      return null;
    }

    const allRegs = opts.allRegistrations || await listRegistrations(eventId);
    const result = await runAgentPipeline(reg, eventId, allRegs);

    const screenedAt = new Date().toISOString();
    const screening = {
      ...result,
      agentVersion: result.agentVersion || AGENT_VERSION,
      screenedAt
    };

    await saveAIScreening(eventId, registrationId, screening);

    // Copy denormalised fields onto the Registration row for fast filter/sort
    await updateRegistration({
      partitionKey: eventId,
      rowKey: registrationId,
      aiScore: result.score,
      profileGroup: result.profileGroup,
      isShortlisted: result.isShortlisted,
      isDuplicate: result.isDuplicate,
      isSpam: result.isSpam,
      isBot: result.isBot,
      agentDraftApprovalEmail: result.draftApprovalEmail || '',
      agentDraftRejectionEmail: result.draftRejectionEmail || '',
      aiScreenedAt: screenedAt
    });

    // Auto-approve gate — only if organizer explicitly opted in
    if (result.autoApproveCandidate) {
      const settings = await getEventSettings(eventId);
      const threshold = Number(settings.autoApproveThreshold) || 8;
      if (settings.autoApproveEnabled && result.score >= threshold) {
        const outcome = await approveRegistration(eventId, registrationId, {
          customEmailBody: result.draftApprovalEmail || undefined,
          actor: 'ai_agent'
        });
        // Always traceable in server logs (rule #4 in the spec).
        console.log('[ai_agent] auto_approved', JSON.stringify({
          eventId,
          registrationId,
          score: result.score,
          threshold,
          profileGroup: result.profileGroup,
          emailOk: !outcome.emailError,
          actor: 'ai_agent',
          ts: new Date().toISOString()
        }));
      }
    }

    if (Array.isArray(result.flags) && result.flags.includes('screening_error')) {
      try {
        await updateEventSettings(eventId, {
          lastAgentError: 'Pipeline returned safe-default',
          lastAgentErrorAt: screenedAt
        });
      } catch (_) { /* best-effort */ }
    }

    return screening;
  } catch (err) {
    console.error('[aiScreening] failed', eventId, registrationId, err);
    try {
      await updateEventSettings(eventId, {
        lastAgentError: err.message || String(err),
        lastAgentErrorAt: new Date().toISOString()
      });
    } catch (_) {}
    return null;
  } finally {
    activeScreenings = Math.max(0, activeScreenings - 1);
  }
}

/**
 * Fire-and-forget trigger. Safe to call from registration request handlers —
 * never throws, never blocks. Uses setImmediate so the response can flush first.
 */
function triggerScreening(eventId, registrationId, opts = {}) {
  setImmediate(async () => {
    try {
      await screenRegistration(eventId, registrationId, opts);
    } catch (err) {
      console.error('[aiScreening] trigger failed', err);
    }
  });
}

/**
 * Re-screen a list of registrations sequentially with a small delay between
 * calls (to respect upstream rate limits when wired to OpenAI).
 */
async function rescreenMany(eventId, registrationIds, { delayMs = 200 } = {}) {
  const allRegs = await listRegistrations(eventId);
  const idSet = registrationIds && registrationIds.length
    ? new Set(registrationIds)
    : null;
  const targets = idSet
    ? allRegs.filter((r) => idSet.has(r.rowKey))
    : allRegs.filter((r) => r.status === 'pending');

  let rescreened = 0;
  let errors = 0;
  for (const reg of targets) {
    try {
      const out = await screenRegistration(eventId, reg.rowKey, {
        registration: reg,
        allRegistrations: allRegs
      });
      if (out) rescreened += 1; else errors += 1;
    } catch (err) {
      console.error('[aiScreening] rescreen entry failed', reg.rowKey, err);
      errors += 1;
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { rescreened, errors, total: targets.length };
}

module.exports = {
  screenRegistration,
  triggerScreening,
  rescreenMany,
  getActiveScreenings,
  getAIScreening
};
