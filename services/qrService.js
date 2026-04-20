const QRCode = require('qrcode');

/**
 * Generate a QR code PNG (base64 data URL) encoding the payload as JSON.
 * Payload shape: { id, token, event }
 */
async function generateQrDataUrl(payload) {
  const text = JSON.stringify(payload);
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 400,
    color: { dark: '#0F0F0F', light: '#FFFFFF' }
  });
  return dataUrl;
}

/** Returns just the base64 body (no data: prefix) — handy for email inline attachments */
async function generateQrBase64(payload) {
  const dataUrl = await generateQrDataUrl(payload);
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

module.exports = { generateQrDataUrl, generateQrBase64 };
