import { countDistinctEvidence, upsertPattern } from './learning-store.mjs';

const WINDOW_DAYS = 7;
const MIN_EVIDENCE = 2;
const ACCEPT_THRESHOLD = 0.80;

const RULES = [
  { type: 'preference', regex: /\b(?:prefiero|me gusta|me encanta|no me gusta|no quiero)\s+([^.!?\n]{2,180})/iu },
  { type: 'working_style', regex: /\b(?:quiero que|desde ahora|a partir de ahora)\s+([^.!?\n]{2,180})/iu },
  { type: 'identity', regex: /\b(?:mi nombre es|me llamo)\s+([^.!?\n]{2,80})/iu },
];

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/["'`]/g, '').trim();
}

export function extractCandidates(userText) {
  if (typeof userText !== 'string' || !userText.trim()) return [];
  const candidates = [];
  for (const rule of RULES) {
    const match = rule.regex.exec(userText);
    if (!match?.[1]) continue;
    const statement = match[1].trim().replace(/[;,]+$/g, '');
    const key = normalize(statement);
    if (key.length < 2) continue;
    candidates.push({ patternType: rule.type, patternKey: key, statement });
  }
  return candidates;
}

function confidenceFor(evidenceCount) {
  return Math.min(0.99, 0.55 + Math.max(0, evidenceCount - 1) * 0.25);
}

export async function processLearningObservation({ userId, userText }) {
  const candidates = extractCandidates(userText);
  if (!candidates.length) return [];
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const learned = [];

  for (const candidate of candidates) {
    const evidenceCount = await countDistinctEvidence(userId, candidate.patternKey, since);
    const confidence = confidenceFor(evidenceCount);
    const accepted = evidenceCount >= MIN_EVIDENCE && confidence >= ACCEPT_THRESHOLD;
    const row = await upsertPattern({
      userId,
      patternKey: candidate.patternKey,
      patternType: candidate.patternType,
      statement: candidate.statement,
      evidenceCount,
      confidence,
      status: accepted ? 'accepted' : 'candidate',
    });
    learned.push({
      id: row.id,
      type: row.pattern_type,
      statement: row.statement,
      evidenceCount,
      confidence: Number(row.confidence),
      status: row.status,
    });
  }
  return learned;
}

export { ACCEPT_THRESHOLD, MIN_EVIDENCE, WINDOW_DAYS };
