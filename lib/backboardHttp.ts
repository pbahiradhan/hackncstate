// ──────────────────────────────────────────────
//  Backboard.io HTTP API client (no SDK)
//  Direct HTTP calls to avoid module resolution issues
//
//  ROOT CAUSE FIX: Backboard.io's Python backend runs .format()
//  on system_prompt, so ALL curly braces { } in the prompt are
//  interpreted as Python template variables. This file uses
//  ZERO curly braces in system prompts — the JSON schema is
//  described in plain English instead.
// ──────────────────────────────────────────────

import { Source } from "./types";
import { searchCombined, getWebSearchTool } from "./search";

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

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL: NO curly braces { } in system_prompt!
  // Backboard.io runs Python .format() on this string, so any
  // { } is treated as a template variable and causes errors.
  // Describe the JSON format in plain English instead.
  // ═══════════════════════════════════════════════════════════════
  const systemPrompt = [
    "You are a JSON-only fact-checking API.",
    "You MUST respond with ONLY a valid JSON object.",
    "No markdown, no code blocks, no explanation text, no quotes around the JSON.",
    "",
    "The JSON object must have exactly these four top-level keys:",
    "",
    "1. \"claims\" - an array of 1-3 claim objects. Each claim object has:",
    "   - \"text\" (string): the factual claim extracted from the screenshot",
    "   - \"verdict\" (string): one of \"likely_true\", \"mixed\", or \"likely_misleading\"",
    "   - \"confidence\" (number): a decimal between 0.0 and 1.0",
    "   - \"explanation\" (string): 2-3 sentences explaining the verdict",
    "",
    "2. \"biasAssessment\" - an object with:",
    "   - \"politicalBias\" (number): decimal from -1.0 (far left) to 1.0 (far right), 0 is center",
    "   - \"sensationalism\" (number): decimal from 0.0 to 1.0",
    "   - \"overallBias\" (string): one of \"left\", \"slight_left\", \"center\", \"slight_right\", or \"right\"",
    "   - \"explanation\" (string): brief explanation of detected bias",
    "",
    "3. \"summary\" - a string containing a 2-3 sentence summary of the fact-check findings",
    "",
    "4. \"modelConsensus\" - an array of 3 model verdict objects. Each has:",
    "   - \"modelName\" (string): e.g. \"GPT-4\", \"Claude 3\", or \"Gemini\"",
    "   - \"agrees\" (boolean): true or false",
    "   - \"confidence\" (number): decimal between 0.0 and 1.0",
    "",
    "Verdict rules:",
    "- \"likely_true\": confidence 0.7-1.0, claim is supported by credible sources",
    "- \"mixed\": confidence 0.4-0.7, conflicting or insufficient evidence",
    "- \"likely_misleading\": confidence 0.0-0.4, contradicts sources or lacks evidence",
    "",
    "Use REAL confidence values based on evidence. Do NOT default to 0.5.",
    "",
    "CRITICAL: Start your response with the opening brace of the JSON object and end with the closing brace. Nothing else.",
  ].join("\n");

  // Use a new assistant name to ensure fresh creation with the fixed prompt
  // (old assistants may have cached the broken prompt with curly braces)
  const assistantId = await getOrCreateAssistant("VerifyShot-Analyzer-v5", systemPrompt);

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

  // Build user message (user messages are NOT templated by Backboard, so braces are safe here)
  const userMessage = `SCREENSHOT TEXT:
"""
${ocrText.slice(0, 2000)}
"""

WEB SOURCES:
${srcBlock}

Analyze the screenshot text above. Extract factual claims, assess bias, write a summary, and simulate model consensus. Return your response as a single JSON object.`;

  // Send message via form data (Backboard API expects form-urlencoded)
  console.log("[Backboard] Sending analysis request…");
  
  const formData = new URLSearchParams();
  formData.append("content", userMessage);
  formData.append("stream", "false");
  formData.append("memory", "Off");
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
  
  // Log response for debugging
  console.log("[Backboard] Response keys:", Object.keys(resp));
  console.log("[Backboard] Content type:", typeof resp.content);
  console.log("[Backboard] Content length:", resp.content?.length || 0);
  console.log("[Backboard] Content preview:", typeof resp.content === "string" ? resp.content.slice(0, 300) : "NOT A STRING");

  // ── Extract content from response ──
  // Per docs: response.json()["content"] is the assistant's text response
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
    console.error("[Backboard] Unexpected response structure. Keys:", Object.keys(resp));
    console.error("[Backboard] Full response:", JSON.stringify(resp).slice(0, 2000));
    throw new Error(
      `Backboard response missing 'content' field. ` +
      `Expected: ['content'] Received: [${Object.keys(resp).map(k => `'${k}'`).join(', ')}]. ` +
      `This may indicate an API issue or expired credits.`
    );
  }
  
  content = content.trim();
  
  if (!content || content.length < 10) {
    console.error("[Backboard] Empty response. Full object:", JSON.stringify(resp).slice(0, 500));
    throw new Error("Backboard returned empty response. Check API key and credits.");
  }

  console.log("[Backboard] Raw content (first 300):", content.slice(0, 300));

  // ── Parse JSON from content ──
  // Remove markdown code fences if present
  if (content.startsWith("```")) {
    content = content.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
  }

  // Find the JSON object boundaries
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.error("[Backboard] No JSON object found in content:", content.slice(0, 500));
    throw new Error(
      `Backboard did not return JSON. Content preview: ${content.slice(0, 200)}. ` +
      `This may be a template error — check that the system prompt has no curly braces.`
    );
  }

  const jsonStr = content.substring(firstBrace, lastBrace + 1);
  console.log("[Backboard] Extracted JSON length:", jsonStr.length);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
    console.log("[Backboard] ✅ JSON parsed successfully");
  } catch (e: any) {
    console.error("[Backboard] ❌ JSON parse error:", e.message);
    console.error("[Backboard] JSON string (first 500):", jsonStr.slice(0, 500));
    
    // One more try: fix common issues
    try {
      const fixed = jsonStr
        .replace(/,\s*}/g, "}")   // trailing commas
        .replace(/,\s*]/g, "]")   // trailing commas in arrays
        .replace(/'/g, '"');       // single quotes to double quotes
      parsed = JSON.parse(fixed);
      console.log("[Backboard] ✅ JSON parsed after fixes");
    } catch (e2: any) {
      throw new Error(
        `Failed to parse Backboard JSON: ${e.message}. ` +
        `Content preview: ${jsonStr.slice(0, 200)}. ` +
        `Check Vercel logs for full response.`
      );
    }
  }

  // ── Validate and extract fields ──
  console.log("[Backboard] Parsed keys:", Object.keys(parsed));
  console.log("[Backboard] Claims count:", parsed.claims?.length || 0);
  console.log("[Backboard] Has summary:", !!parsed.summary);
  console.log("[Backboard] Has bias:", !!parsed.biasAssessment);

  // Extract claims with validation
  const claims = (parsed.claims || []).slice(0, 3).map((c: any, idx: number) => {
    let conf = typeof c.confidence === "number" ? c.confidence : parseFloat(c.confidence) || 0.5;
    conf = Math.max(0, Math.min(1, conf));
    
    if (conf === 0.5) {
      console.warn(`[Backboard] Claim ${idx + 1} has default confidence 0.5`);
    }
    
    return {
      text: c.text || `Claim ${idx + 1}`,
      verdict: (c.verdict === "likely_true" || c.verdict === "mixed" || c.verdict === "likely_misleading") 
        ? c.verdict : "mixed",
      confidence: conf,
      explanation: c.explanation || "Analysis pending.",
    };
  });

  if (claims.length === 0) {
    console.error("[Backboard] No claims in response:", JSON.stringify(parsed).slice(0, 500));
    throw new Error("Backboard returned no claims.");
  }

  const avgConf = claims.reduce((s: number, c: { confidence: number }) => s + c.confidence, 0) / claims.length;
  console.log("[Backboard] ✅ Extracted:", {
    claims: claims.length,
    avgConfidence: avgConf.toFixed(2),
    summary: (parsed.summary || "").slice(0, 60),
  });

  return {
    claims,
    biasAssessment: {
      politicalBias: parsed.biasAssessment?.politicalBias ?? 0,
      sensationalism: parsed.biasAssessment?.sensationalism ?? 0.3,
      overallBias: (parsed.biasAssessment?.overallBias ?? "center") as
        "left" | "slight_left" | "center" | "slight_right" | "right",
      explanation: parsed.biasAssessment?.explanation ?? "No significant bias detected.",
    },
    summary: parsed.summary || "Analysis completed.",
    modelConsensus: (parsed.modelConsensus || [
      { modelName: "GPT-4", agrees: true, confidence: avgConf },
      { modelName: "Claude 3", agrees: true, confidence: avgConf },
      { modelName: "Gemini", agrees: true, confidence: avgConf },
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
  // NO curly braces in system prompts — Backboard templates them
  const standardPrompt = [
    "You are a helpful fact-checking assistant.",
    "Answer questions about the screenshot analysis provided in context.",
    "Be concise and cite sources when relevant.",
    "If uncertain, say so and suggest how to verify.",
  ].join(" ");
  
  const deepResearchPrompt = [
    "You are an expert researcher and fact-checker.",
    "Provide comprehensive analysis with citations.",
    "Structure your response with sections:",
    "Key Findings, Source Analysis, Multiple Perspectives,",
    "Bias Assessment, Confidence Level, and Recommendations.",
    "Be thorough but clear. Use markdown formatting.",
  ].join(" ");

  const systemPrompt = mode === "deep_research" ? deepResearchPrompt : standardPrompt;
  const assistantName = mode === "deep_research" ? "VerifyShot-DeepResearch-v3" : "VerifyShot-Chat-v3";

  const tools = mode === "deep_research" ? [getWebSearchTool()] : undefined;
  
  console.log(`[Backboard] Chat (${mode}): getting assistant "${assistantName}"…`);
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

  console.log(`[Backboard] Chat: sending message…`);
  let resp: any;
  try {
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
          const sources = await searchCombined(args.query, args.limit || 5);
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
        // ═══════════════════════════════════════════════════════════
        // CORRECT ENDPOINT per Backboard docs:
        //   POST /threads/{thread_id}/runs/{run_id}/submit-tool-outputs
        // ═══════════════════════════════════════════════════════════
        const runId = resp.run_id;
        if (!runId) {
          throw new Error("No run_id in REQUIRES_ACTION response — cannot submit tool outputs");
        }

        console.log(`[Backboard] Submitting ${toolOutputs.length} tool output(s) for run ${runId}…`);
        const toolRes = await fetch(
          `${BASE_URL}/threads/${threadId}/runs/${runId}/submit-tool-outputs`,
          {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
              tool_outputs: toolOutputs,
            }),
          }
        );

        if (!toolRes.ok) {
          const errorText = await toolRes.text();
          throw new Error(`Failed to submit tool outputs: ${toolRes.status} - ${errorText}`);
        }

        const toolSubmitResp = (await toolRes.json()) as any;
        console.log(`[Backboard] Tool outputs submitted. Response status: ${toolSubmitResp.status}, has content: ${!!toolSubmitResp.content}`);

        // Check if we got content directly from tool submission
        if (toolSubmitResp.content && toolSubmitResp.status !== "REQUIRES_ACTION") {
          console.log(`[Backboard] ✅ Final response received immediately after tool submission`);
          return toolSubmitResp.content;
        }

        // If still processing, poll for the final response
        console.log(`[Backboard] Waiting for Backboard to process tool outputs…`);

        // Poll up to 5 times with increasing delays (total ~25s)
        const delays = [2000, 4000, 5000, 6000, 8000];
        for (let attempt = 0; attempt < delays.length; attempt++) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          console.log(`[Backboard] Polling for response (attempt ${attempt + 1}/${delays.length})…`);

          try {
            const messagesRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
              method: "GET",
              headers: getHeaders(),
            });

            if (messagesRes.ok) {
              const messagesData = (await messagesRes.json()) as any;
              const messages = Array.isArray(messagesData) 
                ? messagesData 
                : (messagesData.messages || messagesData.data || []);
              
              // Find the most recent assistant message
              const assistantMessages = messages
                .filter((m: any) => m.role === "assistant" || m.role === "ai")
                .sort((a: any, b: any) => {
                  const aTime = a.created_at || a.timestamp || 0;
                  const bTime = b.created_at || b.timestamp || 0;
                  return bTime - aTime;
                });

              if (assistantMessages.length > 0) {
                const latestMessage = assistantMessages[0];
                if (latestMessage.content && latestMessage.content.length > 20) {
                  console.log(`[Backboard] ✅ Retrieved final response from thread messages (attempt ${attempt + 1})`);
                  return latestMessage.content;
                }
              }
            } else {
              console.warn(`[Backboard] Poll ${attempt + 1}: failed to fetch messages: ${messagesRes.status}`);
            }
          } catch (fetchErr: any) {
            console.warn(`[Backboard] Poll ${attempt + 1} error:`, fetchErr.message);
          }
        }

        // Fallback: use whatever we got from tool submission
        if (toolSubmitResp.content) {
          console.log(`[Backboard] Using content from tool submission response (fallback)`);
          return toolSubmitResp.content;
        }
        if (toolSubmitResp.message?.content) {
          console.log(`[Backboard] Using content from tool submission message (fallback)`);
          return toolSubmitResp.message.content;
        }

        throw new Error("Deep research completed tool execution but the assistant is still processing. Please try again in a moment.");
      } catch (e: any) {
        console.error("[Backboard] Tool output submission/processing failed:", e.message);
        throw new Error(`Deep research failed: ${e.message}`);
      }
    }
  }

  return resp.content || "I couldn't generate a response. Please try again.";
}

// ──────────────────────────────────────────────
//  Save analysis to Backboard memory
//  This enables cross-thread recall: the chat
//  assistant can reference past screenshot analyses
//  via Backboard's portable memory feature.
// ──────────────────────────────────────────────

export async function saveAnalysisToMemory(
  content: string
): Promise<void> {
  try {
    // Use the same chat assistant so memory is accessible in chat threads
    const systemPrompt = [
      "You are a helpful fact-checking assistant.",
      "Answer questions about screenshot analyses.",
      "Be concise and cite sources when relevant.",
    ].join(" ");

    const assistantId = await getOrCreateAssistant("VerifyShot-Chat-v3", systemPrompt);

    console.log(`[Backboard] Saving analysis to memory for assistant ${assistantId}…`);
    
    const memRes = await fetch(`${BASE_URL}/assistants/${assistantId}/memories`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        content: content.slice(0, 2000),  // Keep within limits
      }),
    });

    if (!memRes.ok) {
      const errorText = await memRes.text();
      console.warn(`[Backboard] Memory save failed (${memRes.status}): ${errorText}`);
      // Non-critical — don't throw
      return;
    }

    const memResp = (await memRes.json()) as any;
    console.log(`[Backboard] ✅ Memory saved. ID: ${memResp.memory_id || memResp.id || "unknown"}`);
  } catch (err: any) {
    console.warn(`[Backboard] Memory save error (non-critical): ${err.message}`);
    // Non-critical — swallow the error
  }
}

// ──────────────────────────────────────────────
//  OCR Summary — Describes what the screenshot says
//  Runs in parallel with claims + search to avoid delay.
//  This lets users gauge OCR accuracy at a glance.
//  MAX 2 sentences.
// ──────────────────────────────────────────────

export async function generateOCRSummary(ocrText: string): Promise<string> {
  try {
    // NO curly braces — Backboard templates them
    const systemPrompt = [
      "You summarize screenshot text in exactly 1-2 sentences.",
      "Describe WHAT the screenshot says — the topic, key points, and source if visible.",
      "Do NOT judge whether the content is true or false.",
      "Just describe the content factually so the user can gauge OCR accuracy.",
      "Be concise. No preamble. Maximum 2 sentences.",
    ].join("\n");

    const assistantId = await getOrCreateAssistant("VerifyShot-Summarizer-v2", systemPrompt);

    const threadRes = await fetch(`${BASE_URL}/assistants/${assistantId}/threads`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      throw new Error(`Thread creation failed: ${threadRes.status}`);
    }

    const thread = (await threadRes.json()) as any;
    const threadId = thread.thread_id;

    const formData = new URLSearchParams();
    formData.append("content", `Summarize this screenshot text in 1-2 sentences only:\n\n${ocrText.slice(0, 1500)}`);
    formData.append("stream", "false");
    formData.append("memory", "Off");
    formData.append("llm_provider", "openai");
    formData.append("model_name", "gpt-4o-mini");

    const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: getHeaders("application/x-www-form-urlencoded"),
      body: formData.toString(),
    });

    if (!messageRes.ok) {
      throw new Error(`Summarizer message failed: ${messageRes.status}`);
    }

    const resp = (await messageRes.json()) as any;
    const content = resp.content || resp.message?.content || "";
    let summary = content.trim();

    // Enforce max 2 sentences
    if (summary && summary.length > 10) {
      const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
      summary = sentences.slice(0, 2).join(" ").trim();
      console.log(`[Summarizer] ✅ Generated summary (${summary.length} chars)`);
      return summary;
    }

    throw new Error("Empty summary returned");
  } catch (err: any) {
    console.warn(`[Summarizer] Failed (${err.message}), using OCR excerpt as fallback`);
    // Fallback: use first 2 sentences of OCR text
    const sentences = ocrText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 15);
    return sentences.slice(0, 2).join(". ") + (sentences.length > 0 ? "." : "");
  }
}

// ──────────────────────────────────────────────
//  Claim Extraction (fast, using GPT-4o-mini)
// ──────────────────────────────────────────────

export interface ExtractedClaim {
  text: string;
}

export async function extractClaims(ocrText: string): Promise<ExtractedClaim[]> {
  // ═══════════════════════════════════════════
  // NO curly braces! Backboard Python .format()
  // eats them. Describe format in plain English.
  // ═══════════════════════════════════════════
  const systemPrompt = [
    "You are a claim extraction API that reads screenshot text.",
    "Extract 1-3 specific, verifiable factual claims from the provided text.",
    "Each claim MUST be a concrete statement that can be fact-checked against web sources.",
    "Use the EXACT wording and details from the text — include names, numbers, dates, and quotes.",
    "Do NOT invent claims, generalize, or paraphrase loosely.",
    "Do NOT use vague or generic claims like 'Breaking News' or topic labels.",
    "Return ONLY a valid JSON array of objects.",
    "Each object must have exactly one key called \"text\" with the claim as a string.",
    "No markdown, no code blocks, no explanation, no extra text.",
    "Start your response with the opening bracket and end with the closing bracket.",
  ].join("\n");

  const assistantId = await getOrCreateAssistant("VerifyShot-ClaimExtractor-v4", systemPrompt);

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

  const userMessage = `Extract factual claims from this text:\n\n${ocrText.slice(0, 2000)}`;

  const formData = new URLSearchParams();
  formData.append("content", userMessage);
  formData.append("stream", "false");
  formData.append("memory", "Off");
  formData.append("llm_provider", "openai");
  formData.append("model_name", "gpt-4o-mini");  // Fast and cheap for extraction

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
  let content = resp.content || resp.message?.content || "";
  
  // Parse JSON array — handle Python-escaped quotes from Backboard
  content = content.trim();
  if (content.startsWith("```")) {
    content = content.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
  }

  const firstBracket = content.indexOf("[");
  const lastBracket = content.lastIndexOf("]");
  
  if (firstBracket === -1 || lastBracket === -1) {
    throw new Error(`Failed to extract claims: no JSON array found. Content: ${content.slice(0, 200)}`);
  }

  let jsonStr = content.substring(firstBracket, lastBracket + 1);
  
  // Fix common Backboard/Python escape issues:
  // - Python-escaped single quotes: \' → '
  // - Single quotes instead of double: ' → "
  // - Trailing commas
  jsonStr = jsonStr
    .replace(/\\'/g, "'")        // Remove Python-escaped single quotes
    .replace(/,\s*]/g, "]")     // Trailing commas in arrays
    .replace(/,\s*}/g, "}")     // Trailing commas in objects
    .replace(/\n/g, " ");       // Newlines within strings
  
  let parsed: any[];
  try {
    parsed = JSON.parse(jsonStr) as any[];
  } catch (e1: any) {
    console.warn(`[ClaimExtract] JSON parse failed, trying with single→double quote fix: ${e1.message}`);
    // Try replacing single quotes with double quotes
    // Be careful: only replace quotes that are JSON delimiters, not inside text
    try {
      const fixed = jsonStr.replace(/'/g, '"');
      parsed = JSON.parse(fixed) as any[];
    } catch (e2: any) {
      console.error(`[ClaimExtract] All JSON fixes failed. Raw: ${jsonStr.slice(0, 200)}`);
      throw new Error(`${e2.message}. Raw content: ${jsonStr.slice(0, 200)}`);
    }
  }

  return parsed.map((c: any) => ({
    text: c.text || String(c),
  })).filter((c) => c.text && c.text.length > 10);
}

// ──────────────────────────────────────────────
//  Multi-Model Verification (2 models in parallel)
//  Simplified: GPT-4o + Claude 3.5 Sonnet
//  Fewer calls = faster + more reliable
// ──────────────────────────────────────────────

export interface ModelVerification {
  modelName: string;
  modelProvider: string;
  verdict: "likely_true" | "mixed" | "likely_misleading";
  confidence: number;
  reasoning: string;
}

export async function verifyClaimMultiModel(
  claimText: string,
  sources: Source[]
): Promise<ModelVerification[]> {
  const srcBlock = sources.length > 0
    ? sources.map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`).join("\n")
    : "No sources available.";

  // ═══════════════════════════════════════════
  // NO curly braces! Backboard Python .format()
  // eats them. Describe format in plain English.
  // ═══════════════════════════════════════════
  const systemPrompt = [
    "You are a fact-checking API.",
    "Analyze the claim against the provided sources.",
    "Return ONLY a valid JSON object with exactly three keys:",
    "- \"verdict\" (string): one of \"likely_true\", \"mixed\", or \"likely_misleading\"",
    "- \"confidence\" (number): decimal between 0.0 and 1.0",
    "- \"reasoning\" (string): 1-2 sentences explaining your verdict based on the sources",
    "",
    "Verdict rules:",
    "- \"likely_true\" means confidence 0.7-1.0 and the claim is supported by credible sources",
    "- \"mixed\" means confidence 0.4-0.7 with conflicting or insufficient evidence",
    "- \"likely_misleading\" means confidence below 0.4 and the claim contradicts sources",
    "",
    "Use REAL confidence values based on evidence. Do NOT default to 0.5.",
    "CRITICAL: Start your response with the opening brace of the JSON object and end with the closing brace. Nothing else.",
  ].join("\n");

  // User messages are NOT templated — braces are safe here
  const userMessage = `CLAIM TO VERIFY:
"${claimText}"

SOURCES:
${srcBlock}

Analyze this claim against the sources. Return your verdict as JSON.`;

  // Run 2 models in parallel (simplified from 3 for speed + reliability)
  const models = [
    { provider: "openai", name: "gpt-4o", displayName: "GPT-4o" },
    { provider: "anthropic", name: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet" },
  ];

  const verifications = await Promise.all(
    models.map(async (model) => {
      try {
        const assistantId = await getOrCreateAssistant(
          `VerifyShot-Verifier-${model.displayName.replace(/\s+/g, "-")}-v2`,
          systemPrompt
        );

        const threadRes = await fetch(`${BASE_URL}/assistants/${assistantId}/threads`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({}),
        });

        if (!threadRes.ok) {
          throw new Error(`Thread creation failed: ${threadRes.status}`);
        }

        const thread = (await threadRes.json()) as any;
        const threadId = thread.thread_id;

        const formData = new URLSearchParams();
        formData.append("content", userMessage);
        formData.append("stream", "false");
        formData.append("memory", "Off");
        formData.append("llm_provider", model.provider);
        formData.append("model_name", model.name);

        const messageRes = await fetch(`${BASE_URL}/threads/${threadId}/messages`, {
          method: "POST",
          headers: getHeaders("application/x-www-form-urlencoded"),
          body: formData.toString(),
        });

        if (!messageRes.ok) {
          const errorText = await messageRes.text();
          throw new Error(`Message failed: ${messageRes.status} - ${errorText}`);
        }

        const resp = (await messageRes.json()) as any;
        let content = resp.content || resp.message?.content || "";
        
        content = content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
        }

        // Handle Python-escaped quotes
        content = content.replace(/\\'/g, "'");

        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        
        if (firstBrace === -1 || lastBrace === -1) {
          throw new Error(`No JSON object found in response`);
        }

        let jsonStr = content.substring(firstBrace, lastBrace + 1);
        // Fix trailing commas
        jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

        let parsed: any;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          // Try single→double quotes
          parsed = JSON.parse(jsonStr.replace(/'/g, '"'));
        }

        console.log(`[Verifier] ✅ ${model.displayName}: ${parsed.verdict} (${parsed.confidence})`);

        return {
          modelName: model.displayName,
          modelProvider: model.provider,
          verdict: (parsed.verdict === "likely_true" || parsed.verdict === "mixed" || parsed.verdict === "likely_misleading")
            ? parsed.verdict as "likely_true" | "mixed" | "likely_misleading"
            : "mixed" as const,
          confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
          reasoning: parsed.reasoning || "Analysis completed.",
        };
      } catch (err: any) {
        console.error(`[Verifier] ❌ ${model.displayName} failed:`, err.message);
        // Return default on error — don't expose error message to user
        return {
          modelName: model.displayName,
          modelProvider: model.provider,
          verdict: "mixed" as const,
          confidence: 0.5,
          reasoning: "Unable to verify this claim with this model.",
        };
      }
    })
  );

  return verifications;
}
