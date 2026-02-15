// ──────────────────────────────────────────────
//  Backboard.io HTTP API client (no SDK)
//  Direct HTTP calls to avoid module resolution issues
// ──────────────────────────────────────────────

import { Source } from "./types";
import { searchSources, getWebSearchTool } from "./search";

const BASE_URL = "https://app.backboard.io/api";

function getHeaders(): Record<string, string> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) {
    throw new Error("BACKBOARD_API_KEY not set in environment variables");
  }
  if (key.length < 10) {
    throw new Error("BACKBOARD_API_KEY appears invalid (too short)");
  }
  return {
    "X-API-Key": key,
    "Content-Type": "application/json",
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

  const systemPrompt = `You are an expert fact-checker and media analyst. When given text from a screenshot and web sources, perform a COMPLETE analysis.

You MUST return ONLY valid JSON (no markdown, no backticks, no explanation outside the JSON) with this exact structure:
{
  "claims": [
    {
      "text": "The specific factual claim extracted",
      "verdict": "likely_true" or "mixed" or "likely_misleading",
      "confidence": 0.0 to 1.0,
      "explanation": "Brief explanation based on sources"
    }
  ],
  "biasAssessment": {
    "politicalBias": -1.0 to 1.0 (negative = left, positive = right),
    "sensationalism": 0.0 to 1.0,
    "overallBias": "left" or "slight_left" or "center" or "slight_right" or "right",
    "explanation": "Brief explanation of detected bias"
  },
  "summary": "2-3 sentence summary of the fact-check findings",
  "modelConsensus": [
    {"modelName": "GPT-4", "agrees": true/false, "confidence": 0.0-1.0},
    {"modelName": "Claude 3", "agrees": true/false, "confidence": 0.0-1.0},
    {"modelName": "Gemini", "agrees": true/false, "confidence": 0.0-1.0}
  ]
}

Rules:
- Extract 1-3 verifiable factual claims (not opinions)
- Each claim verdict is based on source evidence
- Bias assessment covers the ORIGINAL text's framing
- Model consensus simulates how different AI models would judge the main claim
- Be honest about uncertainty`;

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
  const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      content: userMessage,
      stream: false,
      memory: "Auto",
    }),
  });

  if (!messageRes.ok) {
    const errorText = await messageRes.text();
    throw new Error(`Failed to send message: ${messageRes.status} - ${errorText}`);
  }

  const resp = await messageRes.json();

  // Parse JSON from response
  let content = resp.content?.trim() || "";
  console.log("[Backboard] Raw response length:", content.length);

  // Strip markdown code fences if present
  if (content.startsWith("```")) {
    content = content.replace(/```(?:json)?\n?/g, "").trim();
  }

  // Try to find JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) content = jsonMatch[0];

  try {
    const parsed = JSON.parse(content);
    return {
      claims: (parsed.claims || []).slice(0, 3).map((c: any) => ({
        text: c.text || "Unknown claim",
        verdict: c.verdict || "mixed",
        confidence: Math.max(0, Math.min(1, c.confidence || 0.5)),
        explanation: c.explanation || "Analysis pending.",
      })),
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
  } catch (e) {
    console.error("[Backboard] Failed to parse analysis JSON:", e);
    console.error("[Backboard] Raw content:", content.slice(0, 500));
    // Return a fallback analysis
    return {
      claims: [{
        text: ocrText.split(/[.!?\n]/)[0]?.trim() || ocrText.slice(0, 200),
        verdict: "mixed",
        confidence: 0.5,
        explanation: "Automated analysis could not fully parse. Manual review recommended.",
      }],
      biasAssessment: {
        politicalBias: 0,
        sensationalism: 0.3,
        overallBias: "center",
        explanation: "Unable to fully assess bias.",
      },
      summary: "Analysis was completed but results may be limited. The extracted text has been preserved for review.",
      modelConsensus: [
        { modelName: "GPT-4", agrees: false, confidence: 0 },
        { modelName: "Claude 3", agrees: false, confidence: 0 },
        { modelName: "Gemini", agrees: false, confidence: 0 },
      ],
    };
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
    const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        content: userMessage,
        stream: false,
        memory: "Auto",
      }),
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
