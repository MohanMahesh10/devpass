const { TableClient, odata } = require('@azure/data-tables');

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!CONN) {
  console.warn('[tableStorage] AZURE_STORAGE_CONNECTION_STRING not set — table operations will fail.');
}

const REG_TABLE = 'Registrations';
const SESSION_TABLE = 'AdminSessions';
const SCREENING_TABLE = 'AIScreenings';
const SETTINGS_TABLE = 'EventSettings';

let regClient;
let sessionClient;
let screeningClient;
let settingsClient;
let initPromise;

function getRegClient() {
  if (!regClient) regClient = TableClient.fromConnectionString(CONN, REG_TABLE, { allowInsecureConnection: false });
  return regClient;
}

function getSessionClient() {
  if (!sessionClient) sessionClient = TableClient.fromConnectionString(CONN, SESSION_TABLE, { allowInsecureConnection: false });
  return sessionClient;
}

function getScreeningClient() {
  if (!screeningClient) screeningClient = TableClient.fromConnectionString(CONN, SCREENING_TABLE, { allowInsecureConnection: false });
  return screeningClient;
}

function getSettingsClient() {
  if (!settingsClient) settingsClient = TableClient.fromConnectionString(CONN, SETTINGS_TABLE, { allowInsecureConnection: false });
  return settingsClient;
}

async function ensureTables() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const clients = [getRegClient, getSessionClient, getScreeningClient, getSettingsClient];
    for (const factory of clients) {
      try {
        await factory().createTable();
      } catch (e) {
        if (e.statusCode !== 409) throw e;
      }
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

// ---- AI Screenings ----

async function saveAIScreening(eventId, registrationId, payload) {
  await ensureTables();
  const client = getScreeningClient();
  const entity = {
    partitionKey: eventId,
    rowKey: registrationId,
    score: Number(payload.score) || 0,
    summary: String(payload.summary || ''),
    flags: JSON.stringify(payload.flags || []),
    profileGroup: String(payload.profileGroup || 'Other'),
    isDuplicate: !!payload.isDuplicate,
    duplicateOf: payload.duplicateOf || '',
    isSpam: !!payload.isSpam,
    isBot: !!payload.isBot,
    isShortlisted: !!payload.isShortlisted,
    autoApproveCandidate: !!payload.autoApproveCandidate,
    draftApprovalEmail: String(payload.draftApprovalEmail || ''),
    draftRejectionEmail: String(payload.draftRejectionEmail || ''),
    agentVersion: String(payload.agentVersion || ''),
    model: String(payload.model || ''),
    screenedAt: payload.screenedAt || new Date().toISOString(),
    lastError: String(payload.lastError || '')
  };
  await client.upsertEntity(entity, 'Replace');
}

async function getAIScreening(eventId, registrationId) {
  await ensureTables();
  try {
    const e = await getScreeningClient().getEntity(eventId, registrationId);
    return parseScreeningRow(e);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function listAIScreenings(eventId) {
  await ensureTables();
  const client = getScreeningClient();
  const filter = odata`PartitionKey eq ${eventId}`;
  const items = [];
  for await (const item of client.listEntities({ queryOptions: { filter } })) {
    items.push(parseScreeningRow(item));
  }
  return items;
}

function parseScreeningRow(e) {
  let flags = [];
  try { flags = JSON.parse(e.flags || '[]'); } catch (_) { flags = []; }
  return {
    eventId: e.partitionKey,
    registrationId: e.rowKey,
    score: Number(e.score) || 0,
    summary: e.summary || '',
    flags,
    profileGroup: e.profileGroup || 'Other',
    isDuplicate: !!e.isDuplicate,
    duplicateOf: e.duplicateOf || null,
    isSpam: !!e.isSpam,
    isBot: !!e.isBot,
    isShortlisted: !!e.isShortlisted,
    autoApproveCandidate: !!e.autoApproveCandidate,
    draftApprovalEmail: e.draftApprovalEmail || '',
    draftRejectionEmail: e.draftRejectionEmail || '',
    agentVersion: e.agentVersion || '',
    model: e.model || '',
    screenedAt: e.screenedAt || '',
    lastError: e.lastError || ''
  };
}

// ---- Event settings (single-tenant: one row keyed by eventId) ----

const SETTINGS_DEFAULTS = {
  autoApproveEnabled: false,
  autoApproveThreshold: 8,
  lastAgentError: '',
  lastAgentErrorAt: ''
};

async function getEventSettings(eventId) {
  await ensureTables();
  try {
    const e = await getSettingsClient().getEntity('settings', eventId);
    return {
      eventId,
      autoApproveEnabled: !!e.autoApproveEnabled,
      autoApproveThreshold: Number(e.autoApproveThreshold) || SETTINGS_DEFAULTS.autoApproveThreshold,
      lastAgentError: e.lastAgentError || '',
      lastAgentErrorAt: e.lastAgentErrorAt || ''
    };
  } catch (err) {
    if (err.statusCode === 404) return { eventId, ...SETTINGS_DEFAULTS };
    throw err;
  }
}

async function updateEventSettings(eventId, patch) {
  await ensureTables();
  const current = await getEventSettings(eventId);
  const next = { ...current, ...patch };
  const entity = {
    partitionKey: 'settings',
    rowKey: eventId,
    autoApproveEnabled: !!next.autoApproveEnabled,
    autoApproveThreshold: Math.max(7, Math.min(10, Number(next.autoApproveThreshold) || 8)),
    lastAgentError: String(next.lastAgentError || ''),
    lastAgentErrorAt: String(next.lastAgentErrorAt || '')
  };
  await getSettingsClient().upsertEntity(entity, 'Replace');
  return { eventId, ...entity };
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
  // registrations
  createRegistration,
  getRegistration,
  updateRegistration,
  listRegistrations,
  findByQrToken,
  // sessions
  createSession,
  getSession,
  deleteSession,
  // AI screenings
  saveAIScreening,
  getAIScreening,
  listAIScreenings,
  // settings
  getEventSettings,
  updateEventSettings
};
