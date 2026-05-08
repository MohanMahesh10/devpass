/**
 * services/agentPipeline.js
 * --------------------------------------------------------------------------
 * DevPass agentic registration screening pipeline (v1.0).
 *
 * The agent runs the full 6-step analysis on a single registration:
 *   1. DEEP SCREEN        — score 1-10 + reasoning
 *   2. PROFILE CLASSIFY   — assign one of 10 profile groups
 *   3. DUPLICATE / SPAM   — compare against existing registrations
 *   4. AUTO-APPROVE       — flag candidate (organizer setting decides actual approve)
 *   5. DRAFT EMAIL        — approval + rejection drafts
 *   6. SHORTLIST          — boolean for the AI Shortlist panel
 *
 * The spec calls for ONE GPT-4o-mini call that returns the full JSON.
 * This file ships with a fully deterministic JS implementation so the rest
 * of the system works end-to-end without an OpenAI key. The OpenAI call
 * is wired in a clearly-marked block — flip USE_OPENAI to true (and add the
 * `openai` SDK) to swap the stub for the real model.
 *
 * Contract:
 *   - This function NEVER throws. All errors are caught; a safe default is
 *     returned so the caller can persist a row and the registration flow
 *     is never blocked.
 *   - Caller is responsible for fire-and-forget invocation (setImmediate).
 * --------------------------------------------------------------------------
 */

const AGENT_VERSION = 'v1.0';
const MODEL = 'gpt-4o-mini';
const USE_OPENAI = false; // flip to true once OPENAI_API_KEY + `openai` SDK are wired

const PROFILE_GROUPS = [
  'Senior Developer',
  'Junior Developer',
  'Student',
  'Startup Founder',
  'DevOps / SRE',
  'Designer / UX',
  'Product Manager',
  'Tech Lead / Architect',
  'Community Builder',
  'Other'
];

const TEMP_MAIL_DOMAINS = [
  'mailinator', 'guerrillamail', 'yopmail', 'tempmail', 'sharklasers',
  'throwam', 'trashmail', 'dispostable', 'maildrop'
];

function safeDefault(reason = 'screening_error') {
  return {
    score: 0,
    summary: 'Screening unavailable',
    flags: [reason],
    profileGroup: 'Other',
    isDuplicate: false,
    duplicateOf: null,
    isSpam: false,
    isBot: false,
    isShortlisted: false,
    autoApproveCandidate: false,
    draftApprovalEmail: '',
    draftRejectionEmail: '',
    agentVersion: AGENT_VERSION,
    model: MODEL
  };
}

function wordCount(s = '') {
  return String(s).trim().split(/\s+/).filter(Boolean).length;
}

function emailDomain(email = '') {
  const at = String(email).toLowerCase().lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).split('.')[0] || '';
}

function looksRandom(name = '') {
  const lower = String(name).toLowerCase().replace(/\s+/g, '');
  if (lower.length < 3) return true;
  // long stretch of consonants or repeated chars
  if (/(.)\1{3,}/.test(lower)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(lower)) return true;
  if (/^(asdf|qwer|zxcv|test|user|aaa)/.test(lower)) return true;
  return false;
}

function levenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function similar(a, b, threshold = 0.85) {
  const la = String(a || '').toLowerCase();
  const lb = String(b || '').toLowerCase();
  if (!la || !lb) return false;
  const maxLen = Math.max(la.length, lb.length);
  if (!maxLen) return false;
  return 1 - levenshtein(la, lb) / maxLen >= threshold;
}

/* -------------------- Step 2: profile classify -------------------- */
function classifyProfile(reg) {
  const role = String(reg.role || '').toLowerCase();
  const company = String(reg.company || '').toLowerCase();
  const why = String(reg.whyAttend || '').toLowerCase();
  const linkedin = String(reg.linkedinUrl || '').toLowerCase();
  const blob = `${role} ${company} ${why} ${linkedin}`;

  if (/\b(founder|co-?founder|ceo|cto|ctto|coo)\b/.test(blob)) return 'Startup Founder';
  if (/\b(community|devrel|dev rel|developer advocate|advocacy|ambassador)\b/.test(blob)) return 'Community Builder';
  if (/\b(tech lead|engineering manager|architect|principal engineer|staff engineer)\b/.test(blob)) return 'Tech Lead / Architect';
  if (/\b(product manager|product owner|\bpm\b)\b/.test(blob)) return 'Product Manager';
  if (role === 'designer' || /\b(designer|ux|ui|product design)\b/.test(blob)) return 'Designer / UX';
  if (role === 'devops' || /\b(devops|sre|platform engineer|site reliability)\b/.test(blob)) return 'DevOps / SRE';
  if (role === 'student' || /\b(student|undergrad|university|college|fresher|intern)\b/.test(blob)) return 'Student';

  if (/\b(senior|sr\.|lead developer|10\+ years|8 years|9 years)\b/.test(blob)) return 'Senior Developer';
  if (/\b(junior|jr\.|entry level|0-2 years|1 year|2 years)\b/.test(blob)) return 'Junior Developer';

  if (role === 'developer') return /\b(senior|lead|10|9|8|7 years)\b/.test(blob) ? 'Senior Developer' : 'Junior Developer';
  return 'Other';
}

/* -------------------- Step 3: duplicate / spam / bot -------------------- */
function detectDuplicateSpamBot(reg, allRegistrations = []) {
  const flags = [];
  const newEmail = String(reg.email || '').toLowerCase().trim();
  const newName = String(reg.name || '').toLowerCase().trim();
  const newWhy = String(reg.whyAttend || '').trim();
  const newWhyKey = newWhy.toLowerCase().replace(/\s+/g, ' ');

  let isDuplicate = false;
  let duplicateOf = null;

  for (const other of allRegistrations) {
    if (!other || other.rowKey === reg.rowKey) continue;
    const otherEmail = String(other.email || '').toLowerCase().trim();
    const otherName = String(other.name || '').toLowerCase().trim();
    if (!otherEmail) continue;

    if (otherEmail === newEmail) {
      isDuplicate = true;
      duplicateOf = other.rowKey;
      flags.push('duplicate_exact_email');
      break;
    }

    const sameNameSimilarEmail =
      newName && newName === otherName && similar(newEmail, otherEmail, 0.8);
    if (sameNameSimilarEmail) {
      isDuplicate = true;
      duplicateOf = other.rowKey;
      flags.push('duplicate_fuzzy_email');
      break;
    }
  }

  let isSpam = false;
  if (newWhy && wordCount(newWhy) < 10) {
    isSpam = true;
    flags.push('spam_short_answer');
  }
  if (/lorem ipsum|asdfg+|placeholder|just because|n\/a/i.test(newWhy)) {
    isSpam = true;
    flags.push('spam_placeholder');
  }
  if (/^[\p{Emoji}\s]+$/u.test(newWhy) && newWhy.length > 0) {
    isSpam = true;
    flags.push('spam_emoji_only');
  }
  if (/(.)\1{6,}/.test(newWhy)) {
    isSpam = true;
    flags.push('spam_repeated_chars');
  }
  if (newWhyKey && newWhyKey.length > 20) {
    for (const other of allRegistrations) {
      if (!other || other.rowKey === reg.rowKey) continue;
      const otherWhy = String(other.whyAttend || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (otherWhy && otherWhy === newWhyKey) {
        isSpam = true;
        flags.push('spam_copypaste');
        break;
      }
    }
  }

  let isBot = false;
  const domain = emailDomain(newEmail);
  if (TEMP_MAIL_DOMAINS.includes(domain)) {
    isBot = true;
    flags.push('bot_temp_mail');
  }
  if (looksRandom(newName)) {
    isBot = true;
    flags.push('bot_random_name');
  }
  if (looksRandom(reg.company || '') && (reg.company || '').length > 0) {
    flags.push('bot_nonsense_company');
  }

  return { isDuplicate, duplicateOf, isSpam, isBot, flags };
}

/* -------------------- Step 1: scoring rubric (deterministic stub) -------------------- */
function scoreRegistration(reg, sigs) {
  const why = String(reg.whyAttend || '');
  const wc = wordCount(why);
  let score = 5;

  if (wc >= 80) score += 3;
  else if (wc >= 40) score += 2;
  else if (wc >= 20) score += 1;

  if ((reg.linkedinUrl || '').length) score += 1;
  if ((reg.githubUrl || '').length) score += 1;
  if ((reg.company || '').length) score += 1;

  if (/\b(specifically|because|hoping to|want to learn|build|ship|launch|talk about|present|share)\b/i.test(why)) score += 1;
  if (/\b(maybe|i guess|just curious|free food|swag)\b/i.test(why)) score -= 2;

  if (sigs.isSpam) score -= 4;
  if (sigs.isBot) score -= 4;

  return Math.max(1, Math.min(10, score));
}

function buildSummary(reg, score, profileGroup, sigs) {
  if (sigs.isBot) return 'Looks like a bot or temporary-mail signup; recommend ignoring.';
  if (sigs.isDuplicate) return `Possible duplicate of an earlier registration (id ${sigs.duplicateOf}). Verify before taking action.`;
  if (sigs.isSpam) return 'Answer is short, generic or copy-pasted; low confidence in genuine intent.';
  const wc = wordCount(reg.whyAttend);
  if (score >= 9) return `${profileGroup} with a strong, specific application (${wc} words). Clear value exchange and relevant background.`;
  if (score >= 7) return `${profileGroup} with relevant background and good intent (${wc} words). A solid candidate for the shortlist.`;
  if (score >= 5) return `${profileGroup} with genuine but generic intent (${wc} words). Worth a manual look.`;
  return `${profileGroup} application is vague or low-effort (${wc} words). Likely a no.`;
}

function extractInterestSnippet(whyAttend = '') {
  const sentences = String(whyAttend).split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) return '';
  // Pick the longest sentence under 220 chars as the most "specific" one.
  let best = sentences[0];
  for (const s of sentences) {
    if (s.length <= 220 && s.length > best.length) best = s;
  }
  return best.trim();
}

function buildApprovalDraft(reg, profileGroup) {
  const first = String(reg.name || 'there').split(/\s+/)[0];
  const snippet = extractInterestSnippet(reg.whyAttend);
  const interestLine = snippet
    ? `What you said about "${snippet.slice(0, 180)}" really lined up with what we're putting together.`
    : `Your background as a ${profileGroup.toLowerCase()} is exactly the mix we're hoping to bring into the room.`;
  return [
    `Hey ${first},`,
    '',
    `Great to have you. ${interestLine}`,
    '',
    `Your DevPass is on its way — keep an eye on this inbox for the QR pass and event details. Bring questions, bring projects, talk to people.`,
    '',
    `See you there,`,
    `The DevPass Team`
  ].join('\n');
}

function buildRejectionDraft(reg) {
  const first = String(reg.name || 'there').split(/\s+/)[0];
  return [
    `Hey ${first},`,
    '',
    `Thanks so much for putting your name down — we really appreciate the interest.`,
    `We had an incredible response this round and have hit our capacity for this event, so we're not able to send a pass your way this time.`,
    `We'd love to see you at a future DevPass event — keep building.`,
    '',
    `The DevPass Team`
  ].join('\n');
}

/* -------------------- OpenAI call (real implementation) -------------------- */
/**
 * SWAP-IN POINT:
 * To replace the deterministic stub with the real GPT-4o-mini call:
 *   1. `npm install openai` and set OPENAI_API_KEY in .env
 *   2. Set USE_OPENAI = true at the top of this file
 *   3. The function below is the call that the spec describes — it is a
 *      single API call that returns the full JSON analysis.
 */
async function runWithOpenAI(registration, allRegistrations) {
  const { default: OpenAI } = await import('openai'); // dynamic so missing dep doesn't crash startup
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are an intelligent registration screening agent for DevPass, a developer event platform. You will analyse a new registration and produce a structured JSON analysis covering: intent scoring, profile classification, duplicate/spam detection, auto-approve recommendation, and personalised email drafts.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "score": <1-10 integer>,
  "summary": "<2-3 sentences explaining the score>",
  "flags": ["<flag strings>"],
  "profileGroup": "<one of: ${PROFILE_GROUPS.join(' | ')}>",
  "isDuplicate": <boolean>,
  "duplicateOf": "<registrationId or null>",
  "isSpam": <boolean>,
  "isBot": <boolean>,
  "isShortlisted": <boolean>,
  "autoApproveCandidate": <boolean>,
  "draftApprovalEmail": "<approval email body>",
  "draftRejectionEmail": "<rejection email body>"
}

Scoring rubric (1-10):
  9-10: Specific goals, strong relevant background, clear value exchange
  7-8:  Good intent, relevant background, some specificity
  5-6:  Generic but genuine, limited specificity
  3-4:  Vague, low effort, questionable relevance
  1-2:  Spam, bot, copy-pasted, or clearly irrelevant

Shortlist rule: score >= 7 AND isDuplicate=false AND isSpam=false AND isBot=false
Auto-approve candidate rule: score >= 8 AND isDuplicate=false AND isSpam=false AND isBot=false

Spam indicators: answer < 10 words, lorem ipsum, placeholder text, pure emoji, repeated characters, exact match with another registration answer.
Bot indicators: email domain in [${TEMP_MAIL_DOMAINS.join(', ')}], random-looking name (e.g. "asdfgh user"), nonsense company name.
Duplicate indicators: same email as existing registration, or same name with very similar email.

Keep approval drafts under 100 words, warm, dev-community tone, reference 1-2 specific things from whyAttend.
Keep rejection drafts under 80 words, polite, never says "rejected", mentions capacity.`;

  const userPrompt = `NEW REGISTRATION:
Name: ${registration.name}
Email: ${registration.email}
Company: ${registration.company || 'not provided'}
Role: ${registration.role}
LinkedIn: ${registration.linkedinUrl || 'not provided'}
GitHub: ${registration.githubUrl || 'not provided'}
Why attend: ${registration.whyAttend}

EXISTING REGISTRATIONS FOR THIS EVENT (for duplicate check):
${allRegistrations.slice(0, 50).map(r =>
  `ID:${r.rowKey} | ${r.name} | ${r.email}`
).join('\n')}
${allRegistrations.length > 50 ? `...and ${allRegistrations.length - 50} more` : ''}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return JSON.parse(response.choices[0].message.content);
}

/* -------------------- Deterministic stub (default) -------------------- */
function runDeterministic(registration, allRegistrations) {
  const sigs = detectDuplicateSpamBot(registration, allRegistrations);
  const profileGroup = classifyProfile(registration);
  const score = scoreRegistration(registration, sigs);
  const summary = buildSummary(registration, score, profileGroup, sigs);
  const isShortlisted = score >= 7 && !sigs.isDuplicate && !sigs.isSpam && !sigs.isBot;
  const autoApproveCandidate = score >= 8 && !sigs.isDuplicate && !sigs.isSpam && !sigs.isBot;

  return {
    score,
    summary,
    flags: sigs.flags,
    profileGroup,
    isDuplicate: sigs.isDuplicate,
    duplicateOf: sigs.duplicateOf,
    isSpam: sigs.isSpam,
    isBot: sigs.isBot,
    isShortlisted,
    autoApproveCandidate,
    draftApprovalEmail: buildApprovalDraft(registration, profileGroup),
    draftRejectionEmail: buildRejectionDraft(registration)
  };
}

/* -------------------- Public entry -------------------- */

/**
 * Run the full agentic pipeline.
 * @param {object} registration - the new registration row (rowKey, name, email, role, ...)
 * @param {string} eventId       - partition key
 * @param {Array}  allRegistrations - existing registrations for duplicate check
 * @returns {Promise<object>} structured analysis (never throws).
 */
async function runAgentPipeline(registration, eventId, allRegistrations = []) {
  try {
    const raw = USE_OPENAI
      ? await runWithOpenAI(registration, allRegistrations)
      : runDeterministic(registration, allRegistrations);

    // Normalise + clamp to schema; the model can occasionally drift.
    const score = Math.max(0, Math.min(10, Number(raw.score) || 0));
    const profileGroup = PROFILE_GROUPS.includes(raw.profileGroup) ? raw.profileGroup : 'Other';
    const flags = Array.isArray(raw.flags) ? raw.flags.map(String).slice(0, 12) : [];
    const isDuplicate = !!raw.isDuplicate;
    const isSpam = !!raw.isSpam;
    const isBot = !!raw.isBot;

    return {
      score,
      summary: String(raw.summary || ''),
      flags,
      profileGroup,
      isDuplicate,
      duplicateOf: raw.duplicateOf || null,
      isSpam,
      isBot,
      isShortlisted: score >= 7 && !isDuplicate && !isSpam && !isBot,
      autoApproveCandidate: score >= 8 && !isDuplicate && !isSpam && !isBot,
      draftApprovalEmail: String(raw.draftApprovalEmail || ''),
      draftRejectionEmail: String(raw.draftRejectionEmail || ''),
      agentVersion: AGENT_VERSION,
      model: MODEL
    };
  } catch (err) {
    console.error('[AgentPipeline] failed for', registration && registration.rowKey, err);
    return safeDefault();
  }
}

module.exports = {
  runAgentPipeline,
  AGENT_VERSION,
  MODEL,
  PROFILE_GROUPS,
  TEMP_MAIL_DOMAINS,
  // exported for tests / re-screen tooling
  _classifyProfile: classifyProfile,
  _detectDuplicateSpamBot: detectDuplicateSpamBot
};
