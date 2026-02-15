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

  const systemPrompt = `You are an expert fact-checker and media analyst. Analyze the provided screenshot text and web sources to produce a comprehensive fact-check report.

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY valid JSON - no markdown, no code blocks, no text before or after
2. Start your response with { and end with }
3. Use actual numbers for confidence (0.0-1.0), not defaults
4. Base confidence on source evidence quality

Required JSON structure:
{
  "claims": [
    {
      "text": "The exact factual claim extracted from the screenshot text",
      "verdict": "likely_true",
      "confidence": 0.85,
      "explanation": "2-3 sentence explanation citing specific sources"
    }
  ],
  "biasAssessment": {
    "politicalBias": 0.2,
    "sensationalism": 0.3,
    "overallBias": "slight_right",
    "explanation": "Brief explanation of detected bias patterns"
  },
  "summary": "2-3 sentence summary of the overall fact-check findings",
  "modelConsensus": [
    {"modelName": "GPT-4", "agrees": true, "confidence": 0.8},
    {"modelName": "Claude 3", "agrees": true, "confidence": 0.75},
    {"modelName": "Gemini", "agrees": false, "confidence": 0.4}
  ]
}

VERDICT RULES:
- "likely_true": Claim is supported by credible sources (confidence 0.7-1.0)
- "mixed": Evidence is conflicting or insufficient (confidence 0.4-0.7)
- "likely_misleading": Claim contradicts credible sources or lacks evidence (confidence 0.0-0.4)

CONFIDENCE RULES:
- 0.8-1.0: Strong evidence from multiple credible sources
- 0.6-0.8: Good evidence from credible sources
- 0.4-0.6: Mixed or limited evidence
- 0.0-0.4: Weak or contradictory evidence

BIAS RULES:
- politicalBias: -1.0 (strong left) to 1.0 (strong right), 0 = neutral
- sensationalism: 0.0 (factual) to 1.0 (highly sensational)
- overallBias: "left", "slight_left", "center", "slight_right", "right"

MODEL CONSENSUS RULES:
- "agrees": true if the model would support the main claim, false if it would dispute it
- "confidence": How confident that model would be (0.0-1.0)

IMPORTANT:
1. Extract 1-3 specific, verifiable factual claims (not opinions or general statements)
2. Base verdicts on the provided web sources - cite them in explanations
3. If no sources provided, use "mixed" verdict with lower confidence
4. Be honest about uncertainty - don't overstate confidence
5. Return ONLY the JSON object, nothing else`;

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
  console.log("[Backboard] Response content preview:", JSON.stringify(resp).slice(0, 500));

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
  console.log("[Backboard] Content preview:", content.slice(0, 500));

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

  // Strip markdown code fences if present
  if (content.startsWith("```")) {
    content = content.replace(/```(?:json)?\n?/g, "").trim();
  }

  // Try multiple strategies to extract JSON
  let jsonContent = content;
  
  // Strategy 1: Look for JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonContent = jsonMatch[0];
  } else {
    // Strategy 2: Maybe it's wrapped in text - try to find the JSON part
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonContent = content.substring(jsonStart, jsonEnd + 1);
      console.log("[Backboard] Extracted JSON from wrapped text");
    } else {
      // Strategy 3: Maybe Backboard returned plain text, not JSON
      console.error("[Backboard] ⚠️ No JSON found - Backboard may have returned plain text");
      console.error("[Backboard] Full content:", content);
      // Don't throw yet - try to parse anyway
      jsonContent = content;
    }
  }
  
  content = jsonContent;

  try {
    const parsed = JSON.parse(content);
    console.log("[Backboard] ✅ Parsed JSON successfully");
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
  } catch (e: any) {
    console.error("[Backboard] ❌ Failed to parse analysis JSON");
    console.error("[Backboard] Error:", e.message);
    console.error("[Backboard] Error stack:", e.stack);
    console.error("[Backboard] Content that failed:", content.slice(0, 1000));
    console.error("[Backboard] Full response object:", JSON.stringify(resp).slice(0, 2000));
    
    // If content exists but isn't JSON, Backboard returned text instead of JSON
    if (content.length > 50 && !content.trim().startsWith('{')) {
      console.error("[Backboard] ⚠️ Backboard returned plain text, not JSON!");
      console.error("[Backboard] This means the prompt didn't work - Backboard is ignoring JSON instruction");
      
      // Try to extract any useful info from the text response
      // But still throw an error so we know something is wrong
      throw new Error(
        `Backboard returned plain text instead of JSON. The AI didn't follow the JSON format instruction. ` +
        `Response preview: ${content.slice(0, 200)}... ` +
        `Check Backboard prompt and ensure it's enforcing JSON-only responses.`
      );
    }
    
    // If we get here, it's a real parsing error
    throw new Error(
      `Failed to parse Backboard JSON response: ${e.message}. ` +
      `Content preview: ${content.slice(0, 200)}. ` +
      `Check Vercel logs for full response.`
    );
  }
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
