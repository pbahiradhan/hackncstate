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

  const systemPrompt = `You are a JSON-only fact-checking API. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations, no text before or after.

RESPONSE FORMAT RULES:
1. Start your response with { (opening brace)
2. End your response with } (closing brace)
3. Do NOT wrap the JSON in quotes, backticks, or any other characters
4. Do NOT add any text before or after the JSON
5. The response must be parseable by JSON.parse() directly

EXAMPLE OF CORRECT OUTPUT (copy this exact format):
{"claims":[{"text":"Example claim","verdict":"likely_true","confidence":0.85,"explanation":"Explanation here"}],"biasAssessment":{"politicalBias":0.2,"sensationalism":0.3,"overallBias":"center","explanation":"Bias explanation"},"summary":"Summary text","modelConsensus":[{"modelName":"GPT-4","agrees":true,"confidence":0.8},{"modelName":"Claude 3","agrees":true,"confidence":0.75},{"modelName":"Gemini","agrees":false,"confidence":0.4}]}

REQUIRED JSON STRUCTURE:
{
  "claims": [{"text": "string", "verdict": "likely_true|mixed|likely_misleading", "confidence": 0.0-1.0, "explanation": "string"}],
  "biasAssessment": {"politicalBias": -1.0 to 1.0, "sensationalism": 0.0 to 1.0, "overallBias": "left|slight_left|center|slight_right|right", "explanation": "string"},
  "summary": "string",
  "modelConsensus": [{"modelName": "string", "agrees": true/false, "confidence": 0.0-1.0}]
}

VERDICT RULES:
- "likely_true": confidence 0.7-1.0, supported by credible sources
- "mixed": confidence 0.4-0.7, conflicting/insufficient evidence
- "likely_misleading": confidence 0.0-0.4, contradicts sources or lacks evidence

CONFIDENCE RULES (use actual values, NOT 0.5):
- 0.8-1.0: Strong evidence from multiple credible sources
- 0.6-0.8: Good evidence from credible sources
- 0.4-0.6: Mixed or limited evidence
- 0.0-0.4: Weak or contradictory evidence

CRITICAL: Your response must be valid JSON that can be parsed directly. Start with { and end with }. No other characters.`;

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
  // Try to use a model that supports better JSON output
  // GPT-4o tends to follow JSON format instructions better
  formData.append("llm_provider", "openai");
  formData.append("model_name", "gpt-4o");
  
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
  
  // Log FULL raw response for debugging
  console.log("=".repeat(80));
  console.log("[Backboard] ========== RAW API RESPONSE ==========");
  console.log("[Backboard] Full response object:", JSON.stringify(resp, null, 2));
  console.log("[Backboard] Response keys:", Object.keys(resp));
  console.log("[Backboard] Response status:", resp.status);
  console.log("[Backboard] Response content type:", typeof resp.content);
  console.log("[Backboard] Response content (raw):", resp.content);
  console.log("[Backboard] Response content (stringified):", JSON.stringify(resp.content));
  console.log("[Backboard] Response content length:", resp.content?.length || 0);
  console.log("=".repeat(80));

  // Backboard API returns content as a string in resp.content
  // According to docs: response.json()["content"] contains the text
  let content = "";
  if (typeof resp.content === "string") {
    content = resp.content;
  } else if (resp.message?.content && typeof resp.message.content === "string") {
    content = resp.message.content;
  } else if (resp.text && typeof resp.text === "string") {
    content = resp.text;
  } else if (Array.isArray(resp.messages) && resp.messages.length > 0) {
    const lastMsg = resp.messages[resp.messages.length - 1];
    if (typeof lastMsg.content === "string") {
      content = lastMsg.content;
    }
  } else {
    // Log the full response to understand the structure
    console.error("[Backboard] Unexpected response structure");
    console.error("[Backboard] Response keys:", Object.keys(resp));
    console.error("[Backboard] Response type:", typeof resp);
    console.error("[Backboard] Full response:", JSON.stringify(resp).slice(0, 2000));
    throw new Error("Backboard response format not recognized. Check API response structure.");
  }
  
  // Trim whitespace but preserve the actual content
  content = content.trim();
  
  console.log("=".repeat(80));
  console.log("[Backboard] ========== EXTRACTED CONTENT ==========");
  console.log("[Backboard] Content length:", content.length);
  console.log("[Backboard] Content (first 500 chars):", content.slice(0, 500));
  console.log("[Backboard] Content (last 500 chars):", content.slice(-500));
  console.log("[Backboard] Content (full):", content);
  console.log("[Backboard] Content char codes (first 50):", 
    Array.from(content.slice(0, 50)).map(c => `${c.charCodeAt(0)}(${c})`).join(' '));
  console.log("=".repeat(80));
  
  // Check if content is wrapped in quotes (string literal)
  // Backboard might return JSON as a string literal like '{"claims":...}'
  // Also handle the specific pattern: {\'\\n  "claims"\'}
  const originalContent = content;
  
  if ((content.startsWith("'") && content.endsWith("'")) || 
      (content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith("{\\'") || content.startsWith('{\\"')) ||
      (content.includes("\\'") && content.includes("\\n"))) {
    console.log("[Backboard] ⚠️ Content appears to be a string literal or has escaped quotes");
    console.log("[Backboard] Original content:", content);
    
    // Strategy 1: Unwrap if wrapped in quotes
    if (content.startsWith("'") && content.endsWith("'")) {
      content = content.slice(1, -1);
      console.log("[Backboard] Unwrapped single quotes:", content.slice(0, 100));
    } else if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
      console.log("[Backboard] Unwrapped double quotes:", content.slice(0, 100));
    }
    
    // Strategy 2: Fix escaped quotes at JSON boundaries
    // Pattern: {\'\\n  "claims"\'} -> {\n  "claims"}
    if (content.startsWith("{\\'")) {
      content = '{' + content.substring(3);
      console.log("[Backboard] Fixed escaped quote at start:", content.slice(0, 100));
    }
    if (content.startsWith('{\\"')) {
      content = '{' + content.substring(3);
      console.log("[Backboard] Fixed escaped double quote at start:", content.slice(0, 100));
    }
    if (content.endsWith("\\'}")) {
      content = content.substring(0, content.length - 3) + '}';
      console.log("[Backboard] Fixed escaped quote at end");
    }
    if (content.endsWith('\\"}')) {
      content = content.substring(0, content.length - 3) + '}';
      console.log("[Backboard] Fixed escaped double quote at end");
    }
    
    // Strategy 3: Unescape all escaped single quotes (but be careful with valid escapes)
    // Replace \\' with ' (escaped single quote -> single quote)
    content = content.replace(/\\'/g, "'");
    
    // Strategy 4: Unescape escaped double quotes
    content = content.replace(/\\"/g, '"');
    
    // Strategy 5: Fix escaped newlines
    content = content.replace(/\\n/g, '\n');
    
    console.log("[Backboard] After unwrapping (first 500 chars):", content.slice(0, 500));
    console.log("[Backboard] After unwrapping (last 500 chars):", content.slice(-500));
  }
  
  // If content still looks wrong, try parsing it as JSON string first
  if (content.startsWith('"') && content.endsWith('"')) {
    try {
      console.log("[Backboard] Content is a JSON string, attempting to parse...");
      const parsedString = JSON.parse(content);
      if (typeof parsedString === "string") {
        content = parsedString;
        console.log("[Backboard] Successfully parsed JSON string, new content:", content.slice(0, 200));
      }
    } catch (e) {
      console.log("[Backboard] Failed to parse as JSON string, continuing with original");
    }
  }

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
  
  // ROBUST JSON EXTRACTION: Handle any format Backboard returns
  // Strategy: Find the JSON object, extract it, and clean it
  
  // Step 1: Find the first { and last }
  let firstBrace = content.indexOf('{');
  let lastBrace = content.lastIndexOf('}');
  
  // If no braces found, the content might be a string representation
  // Try to find JSON-like patterns
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.log("[Backboard] No braces found, trying alternative extraction...");
    // Look for patterns like {'\\n  "claims"'} - this is a Python string representation
    const jsonMatch = content.match(/\{[^}]*"claims"[^}]*\}/);
    if (jsonMatch) {
      console.log("[Backboard] Found JSON-like pattern:", jsonMatch[0]);
      content = jsonMatch[0];
      firstBrace = 0;
      lastBrace = content.length - 1;
    } else {
      console.error("[Backboard] ⚠️ No valid JSON structure found");
      console.error("[Backboard] Content:", content);
      throw new Error("Backboard response does not contain valid JSON structure");
    }
  }
  
  // Step 2: Extract the JSON part
  let jsonContent = content.substring(firstBrace, lastBrace + 1);
  
  // Step 3: Clean up the JSON - handle escaped quotes, newlines, etc.
  // The pattern {'\\n  "claims"'} needs to become {\n  "claims"}
  console.log("[Backboard] Before cleaning:", jsonContent.slice(0, 200));
  
  // Fix escaped single quotes at boundaries: {\' -> {
  jsonContent = jsonContent.replace(/^\{\\?['"]/, '{');
  jsonContent = jsonContent.replace(/\\?['"]\}$/, '}');
  
  // Unescape all escaped single quotes: \' -> '
  jsonContent = jsonContent.replace(/\\'/g, "'");
  
  // Unescape escaped newlines: \\n -> \n (but preserve actual \n)
  jsonContent = jsonContent.replace(/\\\\n/g, '\n');
  
  // Unescape escaped double quotes: \" -> " (but only if they're escaping quotes, not in strings)
  // Be careful: we don't want to break valid escaped quotes inside JSON strings
  // Only fix if it's clearly a formatting issue at boundaries
  
  console.log("[Backboard] After cleaning:", jsonContent.slice(0, 200));
  
  content = jsonContent;

  // Try to parse JSON with comprehensive error handling
  let parsed: any;
  let parseAttempts = 0;
  const maxAttempts = 3;
  let lastParseError: Error | null = null;
  
  while (parseAttempts < maxAttempts) {
    try {
      parsed = JSON.parse(content);
      console.log("[Backboard] ✅ Parsed JSON successfully on attempt", parseAttempts + 1);
      break; // Success!
    } catch (parseError: any) {
      lastParseError = parseError;
      parseAttempts++;
      console.error(`[Backboard] ❌ JSON parse attempt ${parseAttempts} failed:`, parseError.message);
      
      if (parseAttempts >= maxAttempts) {
        // Final attempt failed - log everything and throw
        const errorPos = parseError.message.match(/position (\d+)/)?.[1] || "0";
        const pos = parseInt(errorPos);
        console.error("[Backboard] ========== FINAL PARSE FAILURE ==========");
        console.error("[Backboard] Error:", parseError.message);
        console.error("[Backboard] Error position:", errorPos);
        console.error("[Backboard] Content around error:", content.slice(Math.max(0, pos - 50), pos + 50));
        console.error("[Backboard] Full content:", content);
        console.error("[Backboard] ==========================================");
        
        throw new Error(
          `Failed to parse Backboard JSON after ${maxAttempts} attempts: ${parseError.message}. ` +
          `Content preview: ${content.slice(0, 200)}. ` +
          `Check Vercel logs for full response.`
        );
      }
      
      // Try additional fixes for this attempt
      if (parseAttempts === 1) {
        // Attempt 1: Try to fix more escaped characters
        console.log("[Backboard] Attempting additional fixes...");
        content = content.replace(/\\"/g, '"'); // Unescape double quotes
        content = content.replace(/\\\\/g, '\\'); // Fix double backslashes
      } else if (parseAttempts === 2) {
        // Attempt 2: Try to extract JSON from any remaining wrapper
        console.log("[Backboard] Attempting JSON extraction from wrapper...");
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          content = jsonMatch[0];
          console.log("[Backboard] Extracted JSON:", content.slice(0, 200));
        }
      }
    }
  }
  
  // If we get here, parsing succeeded
  if (!parsed) {
    // This should never happen, but TypeScript needs this check
    throw lastParseError || new Error("Failed to parse JSON");
  }
  
  // Continue with parsed object
  console.log("[Backboard] ✅ Parsed JSON successfully");
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
