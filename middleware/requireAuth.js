const { getSession } = require('../services/tableStorage');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const session = await getSession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

    req.session = session;
    next();
  } catch (err) {
    console.error('[requireAuth] error', err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

module.exports = requireAuth;
