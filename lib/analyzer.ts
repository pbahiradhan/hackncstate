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

  // ── Step 2: Extract Claims + Search Sources + OCR Summary (all parallel, ~3s) ──
  console.log(`[Orchestrator][${jobId}] Step 2: Extracting claims, searching sources, and generating summary (parallel)…`);
  
  let extractedClaims: Array<{ text: string }> = [];
  let sources: Source[] = [];
  let ocrSummary: string = "";
  
  try {
    // Extract first meaningful sentence for initial search
    const sentences = ocrText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 15);
    const primaryQuery = sentences[0] || ocrText.slice(0, 200);
    
    // Run claim extraction + AI-powered search + OCR summary — ALL in parallel
    const [claimsResult, primarySources, summaryResult] = await Promise.all([
      extractClaims(ocrText).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Claim extraction failed:`, err.message);
        const firstSentence = sentences[0];
        return firstSentence && firstSentence.length > 10
          ? [{ text: firstSentence }]
          : [{ text: ocrText.slice(0, 200) }];
      }),
      // Uses Perplexity via Backboard (built-in web search, no Google API needed)
      searchCombined(primaryQuery, 8).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] Primary search failed:`, err.message);
        return [];
      }),
      // Generate OCR-based summary (describes what the screenshot says)
      generateOCRSummary(ocrText).catch((err: any) => {
        console.warn(`[Orchestrator][${jobId}] OCR summary failed:`, err.message);
        // Fallback: use first 2 sentences of OCR text
        return sentences.slice(0, 2).join(". ") + (sentences.length > 0 ? "." : "");
      }),
    ]);
    
    extractedClaims = claimsResult;
    sources = primarySources;
    ocrSummary = summaryResult;
    
    // If primary search returned few results, run additional searches using extracted claims
    if (sources.length < 3 && extractedClaims.length > 0) {
      console.log(`[Orchestrator][${jobId}] Running additional searches for ${extractedClaims.length} claim(s)…`);
      const additionalSearches = await Promise.all(
        extractedClaims.slice(0, 2).map(claim =>
          searchCombined(claim.text, 5).catch(() => [] as Source[])
        )
      );
      
      // Merge & deduplicate sources
      const seenUrls = new Set(sources.map(s => s.url));
      for (const results of additionalSearches) {
        for (const src of results) {
          if (!seenUrls.has(src.url)) {
            seenUrls.add(src.url);
            sources.push(src);
          }
        }
      }
      console.log(`[Orchestrator][${jobId}] After additional searches: ${sources.length} total source(s)`);
    }
  } catch (err: any) {
    console.error(`[Orchestrator][${jobId}] Step 2 failed:`, err.message);
    throw new Error(`Analysis failed: ${err.message}`);
  }

  console.log(`[Orchestrator][${jobId}] ✅ Extracted ${extractedClaims.length} claim(s), found ${sources.length} source(s)`);

  // ── Step 3: Quality Gate (local, 0 API calls) ──
  console.log(`[Orchestrator][${jobId}] Step 3: Quality gate check…`);
  
  // Relaxed quality gate: credibility >= 0.6 and only 2 required
  const highQualitySources = sources.filter(s => (s.credibilityScore || 0) >= 0.6);
  const hasMinimumSources = highQualitySources.length >= 2;
  
  if (!hasMinimumSources && sources.length === 0) {
    // Only block if we got ZERO sources at all
    console.log(`[Orchestrator][${jobId}] ⚠️ Quality gate failed: no sources found at all`);
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
  
  // If we have some sources but below threshold, proceed anyway with a warning
  if (!hasMinimumSources) {
    console.log(`[Orchestrator][${jobId}] ⚠️ Below ideal threshold (${highQualitySources.length} high-quality of ${sources.length} total) — proceeding with available sources`);
  } else {
    console.log(`[Orchestrator][${jobId}] ✅ Quality gate passed: ${highQualitySources.length} high-quality sources out of ${sources.length} total`);
  }

  // ── Step 4: Multi-Model Verification (2 models × N claims, all parallel, ~5-8s) ──
  console.log(`[Orchestrator][${jobId}] Step 4: Multi-model verification (${extractedClaims.length} claim(s) × 2 models, parallel)…`);
  
  const allVerifications: ModelVerification[][] = await Promise.all(
    extractedClaims.map((claim) => verifyClaimMultiModel(claim.text, sources))
  );

  console.log(`[Orchestrator][${jobId}] ✅ Multi-model verification complete`);

  // ── Step 5: Bias Detection — 3 parallel calls (1 per perspective) ──
  console.log(`[Orchestrator][${jobId}] Step 5: Bias detection (3 perspectives, parallel)…`);
  
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

  // ── Step 6: Synthesize Results (local computation, 0 API calls) ──
  console.log(`[Orchestrator][${jobId}] Step 6: Synthesizing results…`);
  
  const claims: Claim[] = extractedClaims.map((extracted, claimIdx) => {
    const verifications = allVerifications[claimIdx];
    
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
    
    // Calculate trust score with model agreement
    const bp = biasPenalty(biasSignals);
    const modelAgreement = verifications.filter(v => v.verdict === finalVerdict).length / verifications.length;
    const score = calculateTrustScore(sources, avgConfidence, bp, modelAgreement);
    
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
      sources: sources.slice(0, 5),
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
