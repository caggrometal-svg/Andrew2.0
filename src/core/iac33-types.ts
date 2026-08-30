export type Confidence = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export type EvidenceKind = 'fact' | 'source' | 'indicator' | 'hypothesis' | 'speculation';

export interface Source {
  id: string;
  title: string;
  url?: string;
  publisher?: string;
  retrievedAt: string;
  reliability: Confidence;
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  statement: string;
  sourceIds: string[];
  confidence: Confidence;
}

export interface AnalysisResult {
  question: string;
  conclusion: string;
  confidence: Confidence;
  evidence: EvidenceItem[];
  alternatives: string[];
  contradictions: string[];
  whatWouldChangeTheConclusion: string[];
  generatedAt: string;
}

export interface ForecastScenario {
  name: string;
  probability: number;
  horizon: string;
  rationale: string;
  uncertainty: string;
}

export interface ConnectorStatus {
  id: string;
  name: string;
  category: 'internet' | 'deep-web' | 'satellite' | 'seismic' | 'weather' | 'geospatial';
  enabled: boolean;
  authorized: boolean;
}
