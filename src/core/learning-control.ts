export type LearningPatternType = 'preference' | 'working_style' | 'identity';
export type LearningPatternStatus = 'candidate' | 'accepted' | 'rejected';

export interface LearningCandidate {
  patternType: LearningPatternType;
  patternKey: string;
  statement: string;
}

export interface LearningDecision extends LearningCandidate {
  evidenceCount: number;
  confidence: number;
  status: LearningPatternStatus;
}

export interface LearningPolicy {
  readonly windowDays: number;
  readonly minimumEvidence: number;
  readonly acceptanceThreshold: number;
}

export const CONTROLLED_LEARNING_POLICY: LearningPolicy = Object.freeze({
  windowDays: 7,
  minimumEvidence: 2,
  acceptanceThreshold: 0.8,
});

const RULES: ReadonlyArray<readonly [LearningPatternType, RegExp]> = [
  ['preference', /\b(?:prefiero|me gusta|me encanta|no me gusta|no quiero)\s+([^.!?\n]{2,180})/iu],
  ['working_style', /\b(?:quiero que|desde ahora|a partir de ahora)\s+([^.!?\n]{2,180})/iu],
  ['identity', /\b(?:mi nombre es|me llamo)\s+([^.!?\n]{2,80})/iu],
];

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').replace(/["'`]/g, '').trim();

export function extractLearningCandidates(userText: string): LearningCandidate[] {
  if (!userText.trim()) return [];
  return RULES.flatMap(([patternType, regex]) => {
    const match = regex.exec(userText);
    if (!match?.[1]) return [];
    const statement = match[1].trim().replace(/[;,]+$/g, '');
    const patternKey = normalize(statement);
    return patternKey.length >= 2 ? [{ patternType, patternKey, statement }] : [];
  });
}

export function decideLearningStatus(evidenceCount: number, confidence: number): LearningPatternStatus {
  return evidenceCount >= CONTROLLED_LEARNING_POLICY.minimumEvidence && confidence >= CONTROLLED_LEARNING_POLICY.acceptanceThreshold
    ? 'accepted'
    : 'candidate';
}
