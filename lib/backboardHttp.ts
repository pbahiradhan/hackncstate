// ──────────────────────────────────────────────
//  Backboard.io HTTP API client (no SDK)
//  Direct HTTP calls to avoid module resolution issues
// ──────────────────────────────────────────────

import { Source } from "./types";
import { searchSources, getWebSearchTool } from "./search";

const BASE_URL = "https://app.backboard.io/api";

function getHeaders(contentType: string = "application/json"): Record<string, string> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) {
    throw new Error("BACKBOARD_API_KEY not set in environment variables");
  }
  if (key.length < 10) {
    throw new Error("BACKBOARD_API_KEY appears invalid (too short)");
  }
  return {
    "X-API-Key": key,
    "Content-Type": contentType,
  };
}

// Cache assistant IDs so we don't recreate them on every call
const assistantCache: Record<string, string> = {};

async function getOrCreateAssistant(
  name: string,
  systemPrompt: string,
  tools?: any[]
): Promise<string> {
  if (assistantCache[name]) return assistantCache[name];

  try {
    // First, try to list assistants to see if one with this name exists
    const listRes = await fetch(`${BASE_URL}/assistants`, {
      headers: getHeaders(),
    });

    if (listRes.ok) {
      const assistants = (await listRes.json()) as any;
      const existing = Array.isArray(assistants) 
        ? assistants.find((a: any) => a.name === name)
        : null;
      
      if (existing?.assistant_id) {
        assistantCache[name] = existing.assistant_id;
        return existing.assistant_id;
      }
    }

    // Create new assistant
    const createRes = await fetch(`${BASE_URL}/assistants`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name,
        system_prompt: systemPrompt,
        ...(tools && tools.length > 0 ? { tools } : {}),
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Backboard API error (${createRes.status}): ${errorText}`);
    }

    const assistant = (await createRes.json()) as any;
    if (assistant.assistant_id) {
      assistantCache[name] = assistant.assistant_id;
      return assistant.assistant_id;
    }

    throw new Error("Failed to create assistant: no assistant_id in response");
  } catch (err: any) {
    console.error(`[Backboard] Failed to create assistant "${name}":`, err.message);
    throw new Error(`Backboard assistant creation failed: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
//  Comprehensive analysis via HTTP API
// ──────────────────────────────────────────────

export interface FullAnalysis {
  claims: Array<{
    text: string;
    verdict: "likely_true" | "mixed" | "likely_misleading";
    confidence: number;
    explanation: string;
  }>;
  biasAssessment: {
    politicalBias: number;
    sensationalism: number;
    overallBias: "left" | "slight_left" | "center" | "slight_right" | "right";
    explanation: string;
  };
  summary: string;
  modelConsensus: Array<{
    modelName: string;
    agrees: boolean;
    confidence: number;
  }>;
}

export async function analyzeTextComprehensive(
  ocrText: string,
  sources: Source[]
): Promise<FullAnalysis> {
  const srcBlock = sources.length > 0
    ? sources.map((s, i) => `[${i + 1}] ${s.title} (${s.domain}, ${s.date}): ${s.snippet}`).join("\n")
    : "No web sources available.";

  const systemPrompt = `You are an expert fact-checker. Analyze the screenshot text and web sources.

CRITICAL: Your response MUST be ONLY valid JSON. No markdown, no code blocks, no explanations, no text before or after the JSON. Just the JSON object starting with { and ending with }.

Example of correct response format:
{"claims":[{"text":"Claim here","verdict":"likely_true","confidence":0.85,"explanation":"..."}],"biasAssessment":{"politicalBias":0.2,"sensationalism":0.3,"overallBias":"center","explanation":"..."},"summary":"Summary here","modelConsensus":[{"modelName":"GPT-4","agrees":true,"confidence":0.8}]}

Required JSON structure:
{
  "claims": [
    {
      "text": "The exact factual claim from the screenshot",
      "verdict": "likely_true" or "mixed" or "likely_misleading",
      "confidence": 0.0 to 1.0 (use actual values based on evidence, NOT 0.5),
      "explanation": "2-3 sentences explaining the verdict"
    }
  ],
  "biasAssessment": {
    "politicalBias": -1.0 to 1.0,
    "sensationalism": 0.0 to 1.0,
    "overallBias": "left" or "slight_left" or "center" or "slight_right" or "right",
    "explanation": "Brief bias explanation"
  },
  "summary": "2-3 sentence summary of findings",
  "modelConsensus": [
    {"modelName": "GPT-4", "agrees": true/false, "confidence": 0.0-1.0},
    {"modelName": "Claude 3", "agrees": true/false, "confidence": 0.0-1.0},
    {"modelName": "Gemini", "agrees": true/false, "confidence": 0.0-1.0}
  ]
}

VERDICT RULES:
- "likely_true": Supported by credible sources (confidence 0.7-1.0)
- "mixed": Conflicting/insufficient evidence (confidence 0.4-0.7)
- "likely_misleading": Contradicts sources or lacks evidence (confidence 0.0-0.4)

CONFIDENCE RULES (use actual values, not defaults):
- 0.8-1.0: Strong evidence from multiple credible sources
- 0.6-0.8: Good evidence from credible sources
- 0.4-0.6: Mixed or limited evidence
- 0.0-0.4: Weak or contradictory evidence

IMPORTANT:
- Return ONLY the JSON object, nothing else
- Use actual confidence values (0.6-0.9 for good evidence, 0.3-0.5 for weak evidence)
- Base verdicts on the provided sources
- Extract 1-3 specific factual claims (not opinions)`;

  const assistantId = await getOrCreateAssistant("VerifyShot-Analyzer-v2", systemPrompt);

  // Create thread
  const threadRes = await fetch(`${BASE_URL}/assistants/${assistantId}/threads`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({}),
  });

  if (!threadRes.ok) {
    const errorText = await threadRes.text();
    throw new Error(`Failed to create thread: ${threadRes.status} - ${errorText}`);
  }

  const thread = (await threadRes.json()) as any;
  const threadId = thread.thread_id;

  const userMessage = `SCREENSHOT TEXT:
"""
${ocrText.slice(0, 2000)}
"""

WEB SOURCES:
${srcBlock}

Analyze this content and return the JSON response.`;

  // Send message
  console.log("[Backboard] Sending comprehensive analysis request…");
  
  // Backboard API expects form data, not JSON
  const formData = new URLSearchParams();
  formData.append("content", userMessage);
  formData.append("stream", "false");
  formData.append("memory", "Auto");
  
  const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
    method: "POST",
    headers: getHeaders("application/x-www-form-urlencoded"),
    body: formData.toString(),
  });

  if (!messageRes.ok) {
    const errorText = await messageRes.text();
    throw new Error(`Failed to send message: ${messageRes.status} - ${errorText}`);
  }

  const resp = (await messageRes.json()) as any;
  
  // Log full response structure for debugging
  console.log("[Backboard] Full API response keys:", Object.keys(resp));
  console.log("[Backboard] Response status:", resp.status);
  console.log("[Backboard] Response content type:", typeof resp.content);
  console.log("[Backboard] Full response (first 2000 chars):", JSON.stringify(resp).slice(0, 2000));

  // Backboard API might return content in different formats
  // Try multiple possible fields
  let content = "";
  if (typeof resp.content === "string") {
    content = resp.content.trim();
  } else if (resp.message?.content) {
    content = resp.message.content.trim();
  } else if (resp.text) {
    content = resp.text.trim();
  } else if (Array.isArray(resp.messages) && resp.messages.length > 0) {
    content = resp.messages[resp.messages.length - 1].content?.trim() || "";
  } else {
    // Try to stringify and extract
    const respStr = JSON.stringify(resp);
    console.error("[Backboard] Unexpected response structure:", respStr.slice(0, 1000));
    throw new Error("Backboard response format not recognized. Check API response structure.");
  }
  
  console.log("[Backboard] Extracted content length:", content.length);
  console.log("[Backboard] Raw content (first 1000 chars):", content.slice(0, 1000));
  console.log("[Backboard] Raw content (last 500 chars):", content.slice(-500));

  // Validate we have content
  if (!content || content.length < 10) {
    console.error("[Backboard] ❌ Empty or too short content from Backboard");
    console.error("[Backboard] Response object:", JSON.stringify(resp).slice(0, 1000));
    throw new Error("Backboard returned empty or invalid response. Check API key and credits.");
  }
  
  // Check if it looks like JSON
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('```json') && !trimmed.startsWith('```')) {
    console.error("[Backboard] ⚠️ Response doesn't look like JSON!");
    console.error("[Backboard] First 200 chars:", content.slice(0, 200));
    console.error("[Backboard] This suggests Backboard ignored the JSON-only instruction");
  }

  // Clean up the content - handle various edge cases
  // Remove markdown code fences
  if (content.startsWith("```")) {
    content = content.replace(/```(?:json)?\n?/g, "").replace(/```$/g, "").trim();
  }
  
  // Remove any leading/trailing whitespace and newlines
  content = content.trim();
  
  // Fix common JSON issues:
  // 1. Remove escaped quotes that might be in the string
  // 2. Fix any weird encoding issues
  // 3. Remove any text before the first {
  
  // Find the first { and last }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.error("[Backboard] ⚠️ No valid JSON braces found");
    console.error("[Backboard] Content:", content);
    throw new Error("Backboard response does not contain valid JSON structure");
  }
  
  // Extract just the JSON part
  let jsonContent = content.substring(firstBrace, lastBrace + 1);
  
  // Try to fix common JSON formatting issues
  // Remove any escaped quotes that shouldn't be there
  // But be careful - we don't want to break valid escaped quotes inside strings
  // For now, just log what we have
  console.log("[Backboard] Extracted JSON (first 500 chars):", jsonContent.slice(0, 500));
  console.log("[Backboard] Extracted JSON (last 500 chars):", jsonContent.slice(-500));
  
  content = jsonContent;

  // Try to parse JSON with better error handling
  let parsed: any;
  try {
    parsed = JSON.parse(content);
    console.log("[Backboard] ✅ Parsed JSON successfully");
  } catch (parseError: any) {
    // If parsing fails, try to fix common issues
    console.error("[Backboard] ❌ Initial JSON parse failed:", parseError.message);
    console.error("[Backboard] Parse error at position:", parseError.message.match(/position (\d+)/)?.[1]);
    
    // Try to fix escaped quotes issue - sometimes Backboard returns JSON with escaped quotes
    let fixedContent = content;
    
    // Strategy 1: Fix escaped single quotes at the start/end of JSON
    // Backboard sometimes returns {\'\\n  "claims"\'} which is invalid
    // Remove escaped single quotes that wrap the entire JSON object
    if (fixedContent.match(/^\{\\?['"]/)) {
      fixedContent = fixedContent.replace(/^\{\\?['"]/, '{');
    }
    if (fixedContent.match(/\\?['"]\}$/)) {
      fixedContent = fixedContent.replace(/\\?['"]\}$/, '}');
    }
    
    // Strategy 2: Fix escaped single quotes that are incorrectly escaping property names
    // Pattern: {\'\\n  "claims"\'} should become {\n  "claims"}
    fixedContent = fixedContent.replace(/\\'/g, "'");
    
    // Strategy 3: Fix any double-escaped quotes
    fixedContent = fixedContent.replace(/\\\\"/g, '\\"');
    
    // Strategy 4: Fix escaped newlines that might be causing issues
    // But preserve actual newlines in string values
    fixedContent = fixedContent.replace(/\\n\s*\\n/g, '\\n');
    
    // Strategy 5: Remove any remaining escaped quotes at the very start/end
    // This handles cases where the JSON is wrapped in escaped quotes
    fixedContent = fixedContent.trim();
    if (fixedContent.startsWith("{\\'") || fixedContent.startsWith('{\\"')) {
      fixedContent = '{' + fixedContent.substring(3);
    }
    if (fixedContent.endsWith("\\'}") || fixedContent.endsWith('\\"}')) {
      fixedContent = fixedContent.substring(0, fixedContent.length - 3) + '}';
    }
    
    console.log("[Backboard] Attempting to fix JSON...");
    console.log("[Backboard] Fixed content (first 500 chars):", fixedContent.slice(0, 500));
    
    try {
      parsed = JSON.parse(fixedContent);
      console.log("[Backboard] ✅ Parsed JSON successfully after fixes");
    } catch (secondError: any) {
      // Still failed - log the exact content for debugging
      console.error("[Backboard] ❌ JSON parse failed even after fixes");
      console.error("[Backboard] Second error:", secondError.message);
      console.error("[Backboard] Content around error position:", 
        fixedContent.slice(Math.max(0, parseInt(parseError.message.match(/position (\d+)/)?.[1] || "0") - 50), 
        parseInt(parseError.message.match(/position (\d+)/)?.[1] || "0") + 50));
      throw new Error(
        `Failed to parse Backboard JSON: ${parseError.message}. ` +
        `Content preview: ${content.slice(0, 200)}... ` +
        `Full content length: ${content.length}. ` +
        `Check Vercel logs for full response.`
      );
    }
  }
  
  // Now continue with the parsed object
  console.log("[Backboard] Parsed keys:", Object.keys(parsed));
  console.log("[Backboard] Claims count:", parsed.claims?.length || 0);
  
  // Validate and log each claim
  if (parsed.claims && parsed.claims.length > 0) {
    parsed.claims.forEach((c: any, i: number) => {
      console.log(`[Backboard] Claim ${i + 1}:`, {
        text: c.text?.slice(0, 50) || "MISSING",
        verdict: c.verdict || "MISSING",
        confidence: c.confidence ?? "MISSING",
        hasExplanation: !!c.explanation,
      });
    });
  } else {
    console.error("[Backboard] ⚠️ No claims found in parsed JSON!");
  }
  
  console.log("[Backboard] Summary:", parsed.summary?.slice(0, 100) || "MISSING");
  console.log("[Backboard] Bias assessment:", parsed.biasAssessment ? "Present" : "MISSING");
  console.log("[Backboard] Model consensus:", parsed.modelConsensus?.length || 0);
  
  // Validate confidence values - they should NOT be 0.5 (default)
  const claims = (parsed.claims || []).slice(0, 3).map((c: any, idx: number) => {
    // Handle different confidence formats
    let conf: number;
    if (typeof c.confidence === "number") {
      conf = c.confidence;
    } else if (typeof c.confidence === "string") {
      conf = parseFloat(c.confidence) || 0.5;
    } else {
      conf = 0.5;
    }
    
    // Warn if using default
    if (conf === 0.5) {
      console.warn(`[Backboard] ⚠️ Claim ${idx + 1} has default confidence 0.5`);
      console.warn(`[Backboard] Claim data:`, JSON.stringify(c).slice(0, 200));
    } else {
      console.log(`[Backboard] ✅ Claim ${idx + 1} confidence: ${conf}`);
    }
    
    return {
      text: c.text || `Claim ${idx + 1}`,
      verdict: c.verdict || "mixed",
      confidence: Math.max(0, Math.min(1, conf)),
      explanation: c.explanation || "Analysis pending.",
    };
  });
  
  // Validate we got at least one claim
  if (claims.length === 0) {
    console.error("[Backboard] ❌ No claims extracted from response!");
    console.error("[Backboard] Parsed object:", JSON.stringify(parsed).slice(0, 500));
    throw new Error("Backboard returned no claims. Check the prompt and response format.");
  }
  
  // Log final extracted data
  console.log("[Backboard] ✅ Successfully extracted:", {
    claimsCount: claims.length,
    avgConfidence: (claims.reduce((sum: number, c: { confidence: number }) => sum + c.confidence, 0) / claims.length).toFixed(2),
    hasSummary: !!parsed.summary,
    hasBias: !!parsed.biasAssessment,
    modelConsensusCount: parsed.modelConsensus?.length || 0,
  });
  
  return {
    claims,
    biasAssessment: {
      politicalBias: parsed.biasAssessment?.politicalBias ?? 0,
      sensationalism: parsed.biasAssessment?.sensationalism ?? 0.3,
      overallBias: (parsed.biasAssessment?.overallBias ?? "center") as "left" | "slight_left" | "center" | "slight_right" | "right",
      explanation: parsed.biasAssessment?.explanation ?? "No significant bias detected.",
    },
    summary: parsed.summary || "Analysis completed.",
    modelConsensus: (parsed.modelConsensus || [
      { modelName: "GPT-4", agrees: true, confidence: 0.5 },
      { modelName: "Claude 3", agrees: true, confidence: 0.5 },
      { modelName: "Gemini", agrees: true, confidence: 0.5 },
    ]).map((m: any) => ({
      modelName: m.modelName || "AI Model",
      agrees: !!m.agrees,
      confidence: Math.max(0, Math.min(1, m.confidence || 0.5)),
    })),
  };
}

// ──────────────────────────────────────────────
//  Chat function via HTTP API
// ──────────────────────────────────────────────

const chatThreads: Record<string, string> = {};

export async function chatAboutJob(
  jobId: string,
  contextText: string,
  userMessage: string,
  mode: string = "standard"
): Promise<string> {
  const standardPrompt = `You are a helpful fact-checking assistant. Answer questions about the screenshot analysis provided in context. Be concise and cite sources when relevant.`;
  
  const deepResearchPrompt = `You are an expert researcher and fact-checker. When asked to do deep research, use web search to find recent, authoritative sources. Provide comprehensive analysis with citations. Be thorough but clear.`;

  const systemPrompt = mode === "deep_research" ? deepResearchPrompt : standardPrompt;
  const assistantName = mode === "deep_research" ? "VerifyShot-DeepResearch-v2" : "VerifyShot-Chat-v2";

  // Deep research gets web search tool for richer responses
  const tools = mode === "deep_research" ? [getWebSearchTool()] : undefined;
  
  console.log(`[Backboard] Creating/getting assistant "${assistantName}"…`);
  let id: string;
  try {
    id = await getOrCreateAssistant(assistantName, systemPrompt, tools);
  } catch (err: any) {
    console.error(`[Backboard] Assistant creation failed:`, err);
    throw new Error(`Failed to create Backboard assistant: ${err.message}. Check BACKBOARD_API_KEY.`);
  }

  const threadKey = `${jobId}-${mode}`;
  let threadId = chatThreads[threadKey];
  if (!threadId) {
    console.log(`[Backboard] Creating new thread for ${threadKey}…`);
    try {
      const threadRes = await fetch(`${BASE_URL}/assistants/${id}/threads`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({}),
      });

      if (!threadRes.ok) {
        const errorText = await threadRes.text();
        throw new Error(`Failed to create thread: ${threadRes.status} - ${errorText}`);
      }

      const thread = (await threadRes.json()) as any;
      threadId = thread.thread_id;
      chatThreads[threadKey] = threadId;
    } catch (err: any) {
      console.error(`[Backboard] Thread creation failed:`, err);
      throw new Error(`Failed to create Backboard thread: ${err.message}`);
    }
  }

  console.log(`[Backboard] Chat (${mode}): sending message…`);
  let resp: any;
  try {
    // Backboard API expects form data, not JSON
    const formData = new URLSearchParams();
    formData.append("content", userMessage);
    formData.append("stream", "false");
    formData.append("memory", "Auto");
    
    const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: getHeaders("application/x-www-form-urlencoded"),
      body: formData.toString(),
    });

    if (!messageRes.ok) {
      const errorText = await messageRes.text();
      throw new Error(`Backboard API error (${messageRes.status}): ${errorText}`);
    }

    resp = (await messageRes.json()) as any;
  } catch (err: any) {
    console.error(`[Backboard] addMessage failed:`, err);
    throw new Error(`Backboard API error: ${err.message}. Check your API key and credits.`);
  }

  // Handle tool calls (web search for deep research)
  if (resp.status === "REQUIRES_ACTION" && resp.tool_calls) {
    console.log(`[Backboard] Handling ${resp.tool_calls.length} tool call(s)…`);
    const toolOutputs = [];
    for (const tc of resp.tool_calls) {
      if (tc.function?.name === "web_search") {
        try {
          const args = tc.function.parsed_arguments || JSON.parse(tc.function.arguments || "{}");
          const sources = await searchSources(args.query, args.limit || 5);
          toolOutputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify(sources),
          });
        } catch (e: any) {
          console.error("[Backboard] Web search tool error:", e.message);
          toolOutputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ error: "Search unavailable", results: [] }),
          });
        }
      }
    }

    if (toolOutputs.length > 0) {
      try {
        const toolRes = await fetch(`${BASE_URL}/threads/${threadId}/tool-outputs`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            run_id: resp.run_id,
            tool_outputs: toolOutputs,
          }),
        });

        if (!toolRes.ok) {
          const errorText = await toolRes.text();
          throw new Error(`Failed to submit tool outputs: ${toolRes.status} - ${errorText}`);
        }

        const finalResp = (await toolRes.json()) as any;
        return finalResp.content || "Analysis complete but no text was returned.";
      } catch (e: any) {
        console.error("[Backboard] Tool output submission failed:", e.message);
        // Fall through to return whatever content we have
      }
    }
  }

  return resp.content || "I couldn't generate a response. Please try again.";
}
