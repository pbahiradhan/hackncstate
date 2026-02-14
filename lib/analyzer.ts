// ──────────────────────────────────────────────
//  Main orchestrator — ALL via Backboard.io
//  imageUrl ➜ OCR (backboard) ➜ Claims ➜ Search (tool) ➜ Score ➜ JSON
// ──────────────────────────────────────────────

import {
  extractTextFromImage,
  extractClaims,
  searchSourcesForClaim,
  analyzeClaimWithSources,
  getModelConsensus,
  generateSummary,
} from "./backboard";
import { detectBias } from "./biasDetection";
import { calculateTrustScore, biasPenalty, trustLabel } from "./trustScore";
import { AnalysisResult, Claim } from "./types";

export async function analyzeImage(
  imageUrl: string,
  jobId: string,
  onProgress?: (msg: string) => void
): Promise<AnalysisResult> {
  const log = (msg: string) => {
    console.log(`[${jobId}] ${msg}`);
    onProgress?.(msg);
  };

  // 1 — OCR via Backboard.io
  log("Extracting text from screenshot…");
  const ocrText = await extractTextFromImage(imageUrl);
  if (!ocrText.trim()) throw new Error("No text found in screenshot");

  // 2 — Claim extraction via Backboard.io
  log("Identifying factual claims…");
  const claimTexts = await extractClaims(ocrText);
  if (claimTexts.length === 0) throw new Error("No factual claims detected");

  // 3 — Per-claim pipeline
  log("Searching sources & analyzing claims…");
  const claims: Claim[] = [];

  for (let i = 0; i < claimTexts.length; i++) {
    const text = claimTexts[i];
    log(`Analyzing claim ${i + 1}/${claimTexts.length}…`);

    // Search sources (via backboard.io tool call)
    const sources = await searchSourcesForClaim(text);

    // Run bias detection and analysis in parallel
    const [biasSignals, verdict] = await Promise.all([
      detectBias(text),
      analyzeClaimWithSources(text, sources),
    ]);

    // Get model consensus
    const modelVerdicts = await getModelConsensus(text, sources);

    // Calculate trust score (recency is computed inside calculateTrustScore)
    const bp = biasPenalty(biasSignals);
    const score = calculateTrustScore(sources, verdict.confidence, bp);

    claims.push({
      id: `c${i + 1}`,
      text,
      verdict: verdict.verdict,
      trustScore: score,
      explanation: verdict.explanation,
      sources: sources.slice(0, 5),
      biasSignals,
      modelVerdicts,
    });
  }

  // 4 — Aggregate
  const aggScore =
    claims.length > 0
      ? Math.round(claims.reduce((s, c) => s + c.trustScore, 0) / claims.length)
      : 0;

  // 5 — Summary via Backboard.io
  log("Generating summary…");
  const summary = await generateSummary(
    ocrText,
    claims.map((c) => ({ text: c.text, verdict: c.verdict, trustScore: c.trustScore }))
  );

  log("Analysis complete.");

  return {
    jobId,
    imageUrl,
    ocrText,
    claims,
    aggregateTrustScore: aggScore,
    trustLabel: trustLabel(aggScore),
    summary,
    generatedAt: new Date().toISOString(),
  };
}
