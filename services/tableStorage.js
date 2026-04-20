const { TableClient, odata } = require('@azure/data-tables');

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!CONN) {
  console.warn('[tableStorage] AZURE_STORAGE_CONNECTION_STRING not set — table operations will fail.');
}

const REG_TABLE = 'Registrations';
const SESSION_TABLE = 'AdminSessions';

let regClient;
let sessionClient;
let initPromise;

function getRegClient() {
  if (!regClient) regClient = TableClient.fromConnectionString(CONN, REG_TABLE, { allowInsecureConnection: false });
  return regClient;
}

function getSessionClient() {
  if (!sessionClient) sessionClient = TableClient.fromConnectionString(CONN, SESSION_TABLE, { allowInsecureConnection: false });
  return sessionClient;
}

async function ensureTables() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await getRegClient().createTable();
    } catch (e) {
      if (e.statusCode !== 409) throw e;
    }
    try {
      await getSessionClient().createTable();
    } catch (e) {
      if (e.statusCode !== 409) throw e;
    }
  })();
  return initPromise;
}

// ---- Registrations ----

async function createRegistration(entity) {
  await ensureTables();
  const client = getRegClient();
  await client.createEntity(entity);
  return entity;
}

async function getRegistration(partitionKey, rowKey) {
  await ensureTables();
  try {
    const e = await getRegClient().getEntity(partitionKey, rowKey);
    return e;
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function updateRegistration(entity) {
  await ensureTables();
  await getRegClient().updateEntity(entity, 'Merge');
}

async function listRegistrations(eventId) {
  await ensureTables();
  const client = getRegClient();
  const filter = odata`PartitionKey eq ${eventId}`;
  const items = [];
  for await (const item of client.listEntities({ queryOptions: { filter } })) {
    items.push(item);
  }
  // Newest first
  items.sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  return items;
}

async function findByQrToken(eventId, qrToken) {
  await ensureTables();
  const client = getRegClient();
  const filter = odata`PartitionKey eq ${eventId} and qrToken eq ${qrToken}`;
  for await (const item of client.listEntities({ queryOptions: { filter } })) {
    return item;
  }
  return null;
}

// ---- Admin sessions ----

async function createSession(token, ttlMs) {
  await ensureTables();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);
  await getSessionClient().createEntity({
    partitionKey: 'sessions',
    rowKey: token,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString()
  });
}

async function getSession(token) {
  await ensureTables();
  try {
    const e = await getSessionClient().getEntity('sessions', token);
    if (new Date(e.expiresAt).getTime() < Date.now()) {
      // expired — best-effort cleanup
      try { await getSessionClient().deleteEntity('sessions', token); } catch (_) {}
      return null;
    }
    return e;
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function deleteSession(token) {
  await ensureTables();
  try { await getSessionClient().deleteEntity('sessions', token); } catch (_) {}
}

module.exports = {
  ensureTables,
  createRegistration,
  getRegistration,
  updateRegistration,
  listRegistrations,
  findByQrToken,
  createSession,
  getSession,
  deleteSession
};
