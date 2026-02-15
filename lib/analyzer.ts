// ──────────────────────────────────────────────
//  Orchestrator Agent — Accurate + Efficient
//  OCR → Extract Claims → Quality Gate → Multi-Model Verify → Bias Detect → Synthesize
//  Total: ~10-12 API calls, ~10-15 seconds, all parallelized
// ──────────────────────────────────────────────

import { extractTextFromImage } from "./geminiOcr";
import { extractClaims, verifyClaimMultiModel, ModelVerification, generateOCRSummary } from "./backboardHttp";
import { searchCombined } from "./search";
import { detectBias } from "./biasDetection";
import { calculateTrustScore, biasPenalty, trustLabel } from "./trustScore";
import { AnalysisResult, Claim, Source, ModelVerdict, BiasSignals } from "./types";

export async function analyzeImage(
  imageUrl: string,
  jobId: string
): Promise<AnalysisResult> {
  console.log(`[Orchestrator][${jobId}] 🚀 Starting analysis…`);

  // ── Step 1: OCR via Gemini Vision (1 API call, ~2s) ──
  console.log(`[Orchestrator][${jobId}] Step 1: OCR from ${imageUrl}…`);
  let ocrText: string;
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not set in environment variables");
    }
    ocrText = await extractTextFromImage(imageUrl);
  } catch (err: any) {
    console.error(`[Orchestrator][${jobId}] OCR failed:`, err.message);
    if (err.message?.includes("429") || err.message?.includes("rate limit")) {
      throw new Error("Gemini API rate limit exceeded. Please wait a few minutes and try again.");
    }
    if (err.message?.includes("GEMINI_API_KEY")) {
      throw new Error("OCR failed: GEMINI_API_KEY not set. Set it in Vercel → Settings → Environment Variables.");
    }
    throw new Error(`OCR failed: ${err.message}. Check GEMINI_API_KEY is set and has quota available.`);
  }

  if (!ocrText.trim()) {
    throw new Error("No text found in screenshot");
  }
  console.log(`[Orchestrator][${jobId}] ✅ OCR extracted ${ocrText.length} chars`);

  // ── Step 2: Extract Claims + OCR Summary (parallel, ~2s) ──
  console.log(`[Orchestrator][${jobId}] Step 2: Extracting claims and generating summary (parallel)…`);
  
  let extractedClaims: Array<{ text: string }> = [];
  let ocrSummary: string = "";
  let sources: Source[] = []; // Will be populated in Step 3 after searching per claim
  
  try {
    // Run claim extraction + OCR summary — ALL in parallel
    const [claimsResult, summaryResult] = await Promise.all([
      extractClaims(ocrText).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Claim extraction failed:`, err.message);
        const sentences = ocrText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 15);
        const firstSentence = sentences[0];
        return firstSentence && firstSentence.length > 10
          ? [{ text: firstSentence }]
          : [{ text: ocrText.slice(0, 200) }];
      }),
      // Generate OCR-based summary (describes what the screenshot says)
      generateOCRSummary(ocrText).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] OCR summary failed:`, err.message);
        // Fallback: use first 2 sentences of OCR text
        const sentences = ocrText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 15);
        return sentences.slice(0, 2).join(". ") + (sentences.length > 0 ? "." : "");
      }),
    ]);
    
    extractedClaims = claimsResult;
    ocrSummary = summaryResult;
  } catch (err: any) {
    console.error(`[Orchestrator][${jobId}] Step 2 failed:`, err.message);
    throw new Error(`Analysis failed: ${err.message}`);
  }

  console.log(`[Orchestrator][${jobId}] ✅ Extracted ${extractedClaims.length} claim(s)`);

  // ── Step 3: Search Sources Per Claim + Multi-Model Verification (2 models × N claims, all parallel, ~5-8s) ──
  console.log(`[Orchestrator][${jobId}] Step 3: Searching sources per claim, then verifying (${extractedClaims.length} claim(s) × 2 models, parallel)…`);
  
  // Search sources SPECIFIC to each claim (not shared) — ensures accuracy
  const claimSourcesAndVerifications = await Promise.all(
    extractedClaims.map(async (claim) => {
      // Search for sources relevant to THIS specific claim
      const claimSources = await searchCombined(claim.text, 6).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Source search for claim "${claim.text.slice(0, 50)}..." failed:`, err.message);
        return [] as Source[];
      });
      
      // Verify this claim against its own sources
      const verifications = await verifyClaimMultiModel(claim.text, claimSources);
      
      return { claim, sources: claimSources, verifications };
    })
  );
  
  // Extract verifications and aggregate all sources for bias detection
  const allVerifications: ModelVerification[][] = claimSourcesAndVerifications.map(r => r.verifications);
  const allSources: Source[] = [];
  const seenUrls = new Set<string>();
  for (const { sources: claimSources } of claimSourcesAndVerifications) {
    for (const src of claimSources) {
      if (!seenUrls.has(src.url)) {
        seenUrls.add(src.url);
        allSources.push(src);
      }
    }
  }
  
  // Update sources for bias detection and final result
  sources = allSources;
  
  // Quality gate: check if we have any sources at all
  if (sources.length === 0) {
    console.log(`[Orchestrator][${jobId}] ⚠️ Quality gate failed: no sources found for any claim`);
    console.log(`[Orchestrator][${jobId}] ⚠️ Check BACKBOARD_API_KEY is set (for Perplexity search)`);
    
    // Return "unable to verify" result
    const result: AnalysisResult = {
      jobId,
      imageUrl,
      ocrText,
      claims: extractedClaims.map((c, i) => ({
        id: `c${i + 1}`,
        text: c.text,
        verdict: "unable_to_verify" as const,
        trustScore: 0,
        explanation: `Unable to verify: No web sources found. Ensure BACKBOARD_API_KEY is set for AI-powered search.`,
        sources: [],
        biasSignals: {
          politicalBias: 0,
          sensationalism: 0.3,
          overallBias: "center",
          explanation: "Unable to assess bias without sources.",
        },
        modelVerdicts: [],
      })),
      aggregateTrustScore: 0,
      trustLabel: "Unable to Verify",
      summary: ocrSummary && ocrSummary.length > 10
        ? `${ocrSummary} — Unable to verify: no web sources found.`
        : `Unable to verify claims: No web sources found. Ensure BACKBOARD_API_KEY is set in Vercel environment variables.`,
      generatedAt: new Date().toISOString(),
    };
    
    console.log(`[Orchestrator][${jobId}] ⚠️ Returning "unable to verify" result`);
    return result;
  }

  console.log(`[Orchestrator][${jobId}] ✅ Multi-model verification complete — ${sources.length} total source(s) found`);

  // ── Step 4: Bias Detection — 3 parallel calls (1 per perspective) ──
  console.log(`[Orchestrator][${jobId}] Step 4: Bias detection (3 perspectives, parallel)…`);
  
  let biasSignals: BiasSignals;
  try {
    const claimTexts = extractedClaims.map(c => c.text);
    biasSignals = await detectBias(claimTexts, ocrText, sources);
  } catch (err: any) {
    console.warn(`[Orchestrator][${jobId}] Bias detection failed, using defaults:`, err.message);
    biasSignals = {
      politicalBias: 0,
      sensationalism: 0.3,
      overallBias: "center" as const,
      explanation: "Bias detection encountered an error. Results shown without bias analysis.",
    };
  }

  console.log(`[Orchestrator][${jobId}] ✅ Bias: ${biasSignals.overallBias}, sens: ${biasSignals.sensationalism}`);

  // ── Step 5: Synthesize Results (local computation, 0 API calls) ──
  console.log(`[Orchestrator][${jobId}] Step 5: Synthesizing results…`);
  
  const claims: Claim[] = claimSourcesAndVerifications.map(({ claim: extracted, sources: claimSources, verifications }, claimIdx) => {
    
    // Calculate real consensus (2 models: GPT-4o + Claude 3.5 Sonnet)
    const trueVerdicts = verifications.map(v => v.verdict);
    const likelyTrueCount = trueVerdicts.filter(v => v === "likely_true").length;
    const likelyMisleadingCount = trueVerdicts.filter(v => v === "likely_misleading").length;
    
    // With 2 models: both agree → clear verdict, disagree → mixed
    let finalVerdict: "likely_true" | "mixed" | "likely_misleading";
    if (likelyTrueCount === 2) finalVerdict = "likely_true";
    else if (likelyMisleadingCount === 2) finalVerdict = "likely_misleading";
    else if (likelyTrueCount === 1 && likelyMisleadingCount === 1) finalVerdict = "mixed";
    else {
      // One model said "mixed" — lean toward the other model's verdict
      if (likelyTrueCount === 1) finalVerdict = "likely_true";
      else if (likelyMisleadingCount === 1) finalVerdict = "likely_misleading";
      else finalVerdict = "mixed"; // both said mixed
    }
    
    // Average confidence across models
    const avgConfidence = verifications.reduce((s, v) => s + v.confidence, 0) / verifications.length;
    
    // Convert to ModelVerdict format for UI
    const modelVerdicts: ModelVerdict[] = verifications.map(v => ({
      modelName: v.modelName,
      agrees: v.verdict === finalVerdict,
      confidence: v.confidence,
      verdict: v.verdict,
      reasoning: v.reasoning,
    }));
    
    // Calculate trust score with model agreement (using claim-specific sources)
    const bp = biasPenalty(biasSignals);
    const modelAgreement = verifications.filter(v => v.verdict === finalVerdict).length / verifications.length;
    const score = calculateTrustScore(claimSources, avgConfidence, bp, modelAgreement);
    
    // Generate explanation from model reasoning
    const agreeCount = verifications.filter(v => v.verdict === finalVerdict).length;
    const explanations = verifications.map(v => v.reasoning).filter(Boolean);
    const consensusLabel = agreeCount === verifications.length ? "Both models agree" : "Models disagree";
    const mainExplanation = explanations.length > 0
      ? `${explanations[0]} (${consensusLabel}: ${agreeCount}/${verifications.length} "${finalVerdict}")`
      : `Analysis by ${verifications.length} independent AI models.`;

    console.log(`[Orchestrator][${jobId}] Claim ${claimIdx + 1}:`, {
      text: extracted.text.slice(0, 50) + "...",
      verdict: finalVerdict,
      confidence: avgConfidence.toFixed(2),
      calculatedScore: score,
      modelAgreement: `${agreeCount}/${verifications.length}`,
    });

    return {
      id: `c${claimIdx + 1}`,
      text: extracted.text,
      verdict: finalVerdict,
      trustScore: score,
      explanation: mainExplanation,
      sources: claimSources.slice(0, 5), // Use claim-specific sources
      biasSignals,
      modelVerdicts,
    };
  });

  // Aggregate trust score
  const aggScore = claims.length > 0
    ? Math.round(claims.reduce((s, c) => s + c.trustScore, 0) / claims.length)
    : 0;
  
  // Generate summary — starts with OCR-based description of what the screenshot says
  const summary = generateSummary(claims, biasSignals, sources.length, ocrSummary);

  console.log(`[Orchestrator][${jobId}] ✅ Synthesis complete — trust: ${aggScore}%, ${claims.length} claim(s)`);

  const result: AnalysisResult = {
    jobId,
    imageUrl,
    ocrText,
    claims,
    aggregateTrustScore: aggScore,
    trustLabel: trustLabel(aggScore),
    summary,
    generatedAt: new Date().toISOString(),
  };

  console.log(`[Orchestrator][${jobId}] ✅ Analysis complete — trust: ${aggScore}%, ${claims.length} claim(s)`);
  return result;
}

function generateSummary(
  claims: Claim[],
  biasSignals: any,
  sourceCount: number,
  ocrSummary: string
): string {
  // The summary starts with what the screenshot actually says (OCR-based)
  // so users can gauge how well the OCR read the text.
  const contentDescription = ocrSummary && ocrSummary.length > 10
    ? ocrSummary
    : claims.map(c => c.text).join("; ");

  const mainVerdict = claims[0]?.verdict || "mixed";
  const verdictDesc = mainVerdict === "likely_true" ? "likely true"
    : mainVerdict === "likely_misleading" ? "likely misleading"
    : "unverified";

  const biasDesc = biasSignals.overallBias === "center" ? "relatively neutral"
    : biasSignals.overallBias.replace("_", " ");

  // Build full summary, then cap at 2 sentences
  const full = `${contentDescription} — Verdict: ${verdictDesc} (${sourceCount} source(s), ${biasDesc} framing).`;
  const sentences = full.match(/[^.!?]+[.!?]+/g) || [full];
  return sentences.slice(0, 2).join(" ").trim();
}
