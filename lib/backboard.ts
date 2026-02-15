// ──────────────────────────────────────────────
//  Backboard.io service — simplified
//  ONE comprehensive analysis call + chat
// ──────────────────────────────────────────────

import { Source, BiasSignals, ModelVerdict, Claim } from "./types";
import { searchSources, getWebSearchTool } from "./search";

// Import Backboard SDK - it's ES module only, so we need to use dynamic import
// Vercel serverless functions support ES modules via dynamic import()
let BackboardClientClass: any = null;

async function loadBackboardSDK(): Promise<any> {
  if (BackboardClientClass) {
    return BackboardClientClass;
  }

  try {
    // Try dynamic import - this should work in Vercel's Node.js runtime
    // The SDK is ES module only, but dynamic import() works in CommonJS contexts
    const module = await import("backboard-sdk");
    BackboardClientClass = (module as any).BackboardClient || (module as any).default?.BackboardClient;
    
    if (!BackboardClientClass || typeof BackboardClientClass !== "function") {
      throw new Error("BackboardClient not found in SDK module. Available exports: " + JSON.stringify(Object.keys(module || {})));
    }
    
    return BackboardClientClass;
  } catch (err: any) {
    // Provide helpful error message
    if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
      throw new Error(`Backboard SDK not found. Run: npm install backboard-sdk. Error: ${err.message}`);
    }
    if (err.message?.includes("exports") || err.message?.includes("No \"exports\"")) {
      // This is a known Vercel bundling issue with ES-only modules
      throw new Error(
        `Backboard SDK module resolution failed. The SDK is ES module only and Vercel's bundler has issues with it. ` +
        `Error: ${err.message}. ` +
        `Workaround: You may need to configure Vercel to use ES modules or use Backboard's HTTP API directly.`
      );
    }
    throw new Error(`Failed to load Backboard SDK: ${err.message}`);
  }
}

let _client: any | null = null;
let _clientPromise: Promise<any> | null = null;

async function bb(): Promise<any> {
  if (_client) {
    return _client;
  }
  
  // If we're already loading, wait for that promise
  if (_clientPromise) {
    return _clientPromise;
  }
  
  // Start loading
  _clientPromise = (async () => {
    const key = process.env.BACKBOARD_API_KEY;
    if (!key) {
      throw new Error("BACKBOARD_API_KEY not set in environment variables");
    }
    if (key.length < 10) {
      throw new Error("BACKBOARD_API_KEY appears invalid (too short)");
    }
    try {
      const BackboardClient = await loadBackboardSDK();
      _client = new BackboardClient({ apiKey: key });
      return _client;
    } catch (err: any) {
      _clientPromise = null; // Reset on error so we can retry
      throw new Error(`Failed to initialize Backboard client: ${err.message}`);
    }
  })();
  
  return _clientPromise;
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
    const client = await bb();
    const asst = await client.createAssistant({
      name,
      systemPrompt,
      ...(tools ? { tools } : {}),
    });
    assistantCache[name] = asst.assistantId;
    return asst.assistantId;
  } catch (err: any) {
    console.error(`[Backboard] Failed to create assistant "${name}":`, err.message);
    throw new Error(`Backboard assistant creation failed: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
//  SINGLE comprehensive analysis call
//  Takes OCR text + sources → returns full analysis
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
      "text": "The specific factual claim extracted from the text",
      "verdict": "likely_true" or "mixed" or "likely_misleading",
      "confidence": 0.0 to 1.0,
      "explanation": "2-3 sentence explanation of why this verdict was reached"
    }
  ],
  "biasAssessment": {
    "politicalBias": -1.0 to 1.0 (negative=left, positive=right, 0=center),
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

  const id = await getOrCreateAssistant("VerifyShot-Analyzer-v2", systemPrompt);
  const backboardClient = await bb();
  const thread = await backboardClient.createThread(id);

  const userMessage = `SCREENSHOT TEXT:
"""
${ocrText.slice(0, 2000)}
"""

WEB SOURCES:
${srcBlock}

Analyze this content and return the JSON response.`;

  console.log("[Backboard] Sending comprehensive analysis request…");
  const resp = await backboardClient.addMessage({
    threadId: thread.threadId,
    content: userMessage,
    stream: false,
    memory: "Auto",
  });

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
//  Chat (standard + deep research)
// ──────────────────────────────────────────────

const chatThreads: Record<string, string> = {};

export async function chatAboutJob(
  jobId: string,
  contextText: string,
  userMessage: string,
  mode: string = "standard"
): Promise<string> {
  try {
    const hasContext = contextText && contextText.length > 10;

    const standardPrompt = hasContext
      ? `You are a focused research assistant helping users verify information from screenshots.

Context from screenshot analysis:
${contextText}

Guidelines:
- Answer questions about the screenshot's claims and sources
- Reference specific sources when available
- If uncertain, say "unverified" and suggest how to confirm
- Be concise and helpful`
      : `You are a helpful fact-checking assistant. Users ask you to verify claims or answer questions.

Guidelines:
- Provide clear, factual answers
- If uncertain, say "unverified" and suggest how to confirm
- Be concise`;

    const deepResearchPrompt = hasContext
      ? `You are an expert research analyst conducting deep research on a screenshot's claims.

Context from screenshot analysis:
${contextText}

Provide a thorough, structured analysis with these sections:
1. **Key Findings** — What the evidence shows
2. **Source Analysis** — Quality and reliability of available sources
3. **Multiple Perspectives** — Different viewpoints on this topic
4. **Bias Assessment** — Any detected bias in the original content
5. **Confidence Level** — How confident are we in the conclusions
6. **Recommendations** — What the user should know or do

Be detailed and thorough. Use markdown formatting.`
      : `You are an expert research analyst. Users want thorough investigations of topics or claims.

Provide a detailed, structured analysis with these sections:
1. **Key Findings** — What the evidence shows
2. **Source Analysis** — Quality and reliability of available information
3. **Multiple Perspectives** — Different viewpoints
4. **Bias Assessment** — Potential biases to be aware of
5. **Confidence Level** — How confident are we
6. **Recommendations** — Key takeaways

Be thorough and analytical. Use markdown formatting.`;

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
      const chatClient = await bb();
      const thread = await chatClient.createThread(id);
      threadId = thread.threadId;
      chatThreads[threadKey] = threadId;
    } catch (err: any) {
      console.error(`[Backboard] Thread creation failed:`, err);
      throw new Error(`Failed to create Backboard thread: ${err.message}`);
    }
  }

  console.log(`[Backboard] Chat (${mode}): sending message…`);
  let resp: any;
    try {
      const chatClient = await bb();
      resp = await chatClient.addMessage({
        threadId,
        content: userMessage,
        stream: false,
        memory: "Auto",
      });
    } catch (err: any) {
      console.error(`[Backboard] addMessage failed:`, err);
      throw new Error(`Backboard API error: ${err.message}. Check your API key and credits.`);
    }

    // Handle tool calls (web search for deep research)
    if (resp.status === "REQUIRES_ACTION" && resp.toolCalls) {
      console.log(`[Backboard] Handling ${resp.toolCalls.length} tool call(s)…`);
      const toolOutputs = [];
      for (const tc of resp.toolCalls) {
        if (tc.function.name === "web_search") {
          try {
            const args = tc.function.parsedArguments || JSON.parse(tc.function.arguments || "{}");
            const sources = await searchSources(args.query, args.limit || 5);
            toolOutputs.push({
              toolCallId: tc.id,
              output: JSON.stringify(sources),
            });
          } catch (e: any) {
            console.error("[Backboard] Web search tool error:", e.message);
            toolOutputs.push({
              toolCallId: tc.id,
              output: JSON.stringify({ error: "Search unavailable", results: [] }),
            });
          }
        }
      }

      if (toolOutputs.length > 0) {
        try {
          const toolClient = await bb();
          const finalResp = await toolClient.submitToolOutputs({
          threadId,
          runId: resp.runId,
          toolOutputs,
        });
        return finalResp.content || "Analysis complete but no text was returned.";
      } catch (e: any) {
        console.error("[Backboard] Tool output submission failed:", e.message);
        // Fall through to return whatever content we have
      }
    }
    }

    if (!resp.content) {
      throw new Error("Backboard returned empty response. Check API key and credits.");
    }

    return resp.content;
  } catch (err: any) {
    console.error("[Backboard] chatAboutJob error:", err.message);
    throw err; // Re-throw so the API endpoint can catch it
  }
}
