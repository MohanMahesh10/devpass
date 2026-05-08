/**
 * services/decisionService.js
 * --------------------------------------------------------------------------
 * Programmatic approve / reject helpers, shared by:
 *   - routes/actions.js (organizer clicks Approve/Reject)
 *   - services/aiScreeningService.js (auto-approve by AI agent)
 *
 * Both paths support an optional customEmailBody — if provided, it's used as
 * the email body verbatim (wrapped in the standard DevPass email shell);
 * otherwise the default template is used.
 * --------------------------------------------------------------------------
 */

const { v4: uuidv4 } = require('uuid');

const { getRegistration, updateRegistration } = require('./tableStorage');
const { generateQrBase64 } = require('./qrService');
const {
  sendApprovalEmail,
  sendRejectionEmail,
  sendCustomApprovalEmail,
  sendCustomRejectionEmail
} = require('./emailService');

const EVENT_ID = process.env.EVENT_ID || 'devpass-2025';
const EVENT_NAME = process.env.EVENT_NAME || 'DevPass 2025';
const EVENT_DATE = process.env.EVENT_DATE || '';
const EVENT_VENUE = process.env.EVENT_VENUE || '';

/**
 * Approve a registration (idempotent — returns existing on already-approved).
 *
 * @param {string} eventId
 * @param {string} registrationId
 * @param {object} opts
 * @param {string} [opts.customEmailBody] - if provided, used as the email body
 * @param {string} [opts.actor='admin']   - "admin" | "ai_agent"
 * @returns {Promise<{ ok:boolean, status:string, alreadyDone?:boolean, emailError?:string }>}
 */
async function approveRegistration(eventId, registrationId, opts = {}) {
  const reg = await getRegistration(eventId, registrationId);
  if (!reg) return { ok: false, error: 'Registration not found', notFound: true };
  if (reg.status === 'approved') {
    return { ok: true, status: 'approved', alreadyDone: true };
  }

  const qrToken = uuidv4();
  const now = new Date().toISOString();

  await updateRegistration({
    partitionKey: eventId,
    rowKey: registrationId,
    status: 'approved',
    qrToken,
    decidedAt: now,
    decidedBy: opts.actor || 'admin'
  });

  try {
    const payload = { id: registrationId, token: qrToken, event: eventId };
    const qrBase64 = await generateQrBase64(payload);
    if (opts.customEmailBody && typeof opts.customEmailBody === 'string') {
      await sendCustomApprovalEmail({
        to: reg.email,
        name: reg.name,
        eventName: EVENT_NAME,
        eventDate: EVENT_DATE,
        eventVenue: EVENT_VENUE,
        qrBase64,
        bodyText: opts.customEmailBody
      });
    } else {
      await sendApprovalEmail({
        to: reg.email,
        name: reg.name,
        eventName: EVENT_NAME,
        eventDate: EVENT_DATE,
        eventVenue: EVENT_VENUE,
        qrBase64
      });
    }
    return { ok: true, status: 'approved' };
  } catch (mailErr) {
    console.error('[decisionService.approve] email failed', mailErr);
    return {
      ok: false,
      status: 'approved',
      emailError: mailErr.message || String(mailErr),
      partial: true
    };
  }
}

async function rejectRegistration(eventId, registrationId, opts = {}) {
  const reg = await getRegistration(eventId, registrationId);
  if (!reg) return { ok: false, error: 'Registration not found', notFound: true };
  if (reg.status === 'rejected') {
    return { ok: true, status: 'rejected', alreadyDone: true };
  }

  const now = new Date().toISOString();
  await updateRegistration({
    partitionKey: eventId,
    rowKey: registrationId,
    status: 'rejected',
    decidedAt: now,
    decidedBy: opts.actor || 'admin'
  });

  try {
    if (opts.customEmailBody && typeof opts.customEmailBody === 'string') {
      await sendCustomRejectionEmail({
        to: reg.email,
        name: reg.name,
        eventName: EVENT_NAME,
        bodyText: opts.customEmailBody
      });
    } else {
      await sendRejectionEmail({ to: reg.email, name: reg.name, eventName: EVENT_NAME });
    }
    return { ok: true, status: 'rejected' };
  } catch (mailErr) {
    console.error('[decisionService.reject] email failed', mailErr);
    return {
      ok: false,
      status: 'rejected',
      emailError: mailErr.message || String(mailErr),
      partial: true
    };
  }
}

module.exports = {
  approveRegistration,
  rejectRegistration,
  EVENT_ID
};
