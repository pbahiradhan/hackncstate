// ──────────────────────────────────────────────
//  Core data types shared by backend + iOS
// ──────────────────────────────────────────────

export interface Source {
  title: string;
  url: string;
  domain: string;
  date: string;
  credibilityScore: number;   // 0-1
  snippet: string;
}

export interface BiasSignals {
  politicalBias: number;       // -1 (far left) to 1 (far right)
  sensationalism: number;      // 0-1
  overallBias: "left" | "slight_left" | "center" | "slight_right" | "right";
  explanation: string;
}

export interface ModelVerdict {
  modelName: string;           // e.g. "GPT-4", "Claude 3", "Gemini"
  agrees: boolean;
  confidence: number;          // 0-1
}

export interface Claim {
  id: string;
  text: string;
  verdict: "likely_true" | "mixed" | "likely_misleading";
  trustScore: number;          // 0-100
  explanation: string;
  sources: Source[];
  biasSignals: BiasSignals;
  modelVerdicts: ModelVerdict[];
}

export interface AnalysisResult {
  jobId: string;
  imageUrl: string;
  ocrText: string;
  claims: Claim[];
  aggregateTrustScore: number; // 0-100
  trustLabel: string;          // "Likely True" | "Unverified / Mixed" | "Likely Misleading"
  summary: string;             // one-paragraph quick summary
  generatedAt: string;
}

export interface JobStatus {
  status: "pending" | "processing" | "completed" | "error";
  progress?: string;           // human-readable progress text
  result?: AnalysisResult;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}
