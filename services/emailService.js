const { EmailClient } = require('@azure/communication-email');

const CONN = process.env.ACS_CONNECTION_STRING;
const SENDER = process.env.ACS_SENDER_EMAIL;

let client;
function getClient() {
  if (!CONN) {
    throw new Error('ACS_CONNECTION_STRING is not set');
  }
  if (!client) client = new EmailClient(CONN);
  return client;
}

const LIME = '#C8E649';
const DARK = '#0F0F0F';
const MUTED = '#888888';

function brandHeader(eventName) {
  return `
    <div style="background:${DARK};padding:22px 28px;border-bottom:3px solid ${LIME};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;">
            <div style="width:28px;height:28px;background:${LIME};border-radius:6px;display:inline-block;vertical-align:middle;text-align:center;line-height:28px;color:${DARK};font-weight:700;font-family:Inter,Arial,sans-serif;font-size:14px;">QR</div>
          </td>
          <td style="vertical-align:middle;padding-left:10px;">
            <span style="font-family:Inter,Arial,sans-serif;font-size:16px;font-weight:500;color:#F5F5F5;letter-spacing:-0.02em;">
              Dev<span style="color:${LIME};">Pass</span>
            </span>
            <div style="font-family:Inter,Arial,sans-serif;font-size:11px;color:${LIME};letter-spacing:0.06em;text-transform:uppercase;margin-top:2px;">${escapeHtml(eventName)}</div>
          </td>
        </tr>
      </table>
    </div>`;
}

function emailShell(eventName, innerHtml) {
  return `
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
      <body style="margin:0;padding:0;background:#f2f2f2;font-family:Inter,Arial,sans-serif;color:#111;">
        <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          ${brandHeader(eventName)}
          <div style="padding:28px;">
            ${innerHtml}
          </div>
          <div style="padding:18px 28px;border-top:1px solid #eee;color:${MUTED};font-size:11px;letter-spacing:0.03em;">
            You received this because you registered on devpass.
          </div>
        </div>
      </body>
    </html>`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, html, attachments }) {
  if (!SENDER) throw new Error('ACS_SENDER_EMAIL is not set');
  const message = {
    senderAddress: SENDER,
    content: { subject, html },
    recipients: { to: [{ address: to }] },
    attachments: attachments || []
  };
  const poller = await getClient().beginSend(message);
  const result = await poller.pollUntilDone();
  return result;
}

async function sendApprovalEmail({ to, name, eventName, eventDate, eventVenue, qrBase64 }) {
  const subject = `Your DevPass is ready — ${eventName}`;
  const inner = `
    <h2 style="font-size:22px;font-weight:500;letter-spacing:-0.02em;margin:0 0 6px;">Hi ${escapeHtml(name)}, you're in.</h2>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 18px;">Your registration has been approved. Here's your DevPass for <strong>${escapeHtml(eventName)}</strong>.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
      <tr>
        <td style="font-size:11px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;padding:2px 14px 2px 0;">Date</td>
        <td style="font-size:13px;color:#111;padding:2px 0;">${escapeHtml(eventDate)}</td>
      </tr>
      <tr>
        <td style="font-size:11px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;padding:2px 14px 2px 0;">Venue</td>
        <td style="font-size:13px;color:#111;padding:2px 0;">${escapeHtml(eventVenue)}</td>
      </tr>
    </table>

    <div style="text-align:center;background:#0F0F0F;border-radius:14px;padding:20px;margin:18px 0;">
      <img src="cid:devpass-qr" alt="Your DevPass QR" width="200" height="200" style="display:block;margin:0 auto;background:#fff;border-radius:12px;padding:10px;" />
      <div style="color:${LIME};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;margin-top:12px;font-weight:500;">Your DevPass</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 8px;">Show this QR at the entrance. Screenshot it or keep this email handy.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:18px 0 0;">See you there —<br/><span style="color:#111;font-weight:500;">The DevPass Team</span></p>
  `;

  const html = emailShell(eventName, inner);

  const attachments = [{
    name: 'devpass-qr.png',
    contentType: 'image/png',
    contentInBase64: qrBase64,
    contentId: 'devpass-qr'
  }];

  return sendEmail({ to, subject, html, attachments });
}

async function sendPendingEmail({ to, name, eventName }) {
  const subject = `We got your registration — ${eventName}`;
  const inner = `
    <h2 style="font-size:22px;font-weight:500;letter-spacing:-0.02em;margin:0 0 10px;">Hi ${escapeHtml(name)},</h2>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px;">Thanks for registering for <strong>${escapeHtml(eventName)}</strong>. Your application is in.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px;">Our team is reviewing it now. Once approved, you'll get a follow-up email with your entry QR — so keep an eye on your inbox.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:18px 0 0;">Appreciate the interest —<br/><span style="color:#111;font-weight:500;">The DevPass Team</span></p>
  `;
  const html = emailShell(eventName, inner);
  return sendEmail({ to, subject, html });
}

async function sendRejectionEmail({ to, name, eventName }) {
  const subject = `Your DevPass registration for ${eventName}`;
  const inner = `
    <h2 style="font-size:22px;font-weight:500;letter-spacing:-0.02em;margin:0 0 10px;">Hi ${escapeHtml(name)},</h2>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px;">Thank you so much for your interest in <strong>${escapeHtml(eventName)}</strong>.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 12px;">We had an incredible response and have reached our capacity for this event.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:0 0 18px;">We truly appreciate your enthusiasm and hope to see you at a future DevPass event.</p>
    <p style="font-size:14px;line-height:1.6;color:#333;margin:18px 0 0;">Warm regards,<br/><span style="color:#111;font-weight:500;">The DevPass Team</span></p>
  `;
  const html = emailShell(eventName, inner);
  return sendEmail({ to, subject, html });
}

module.exports = { sendPendingEmail, sendApprovalEmail, sendRejectionEmail };
