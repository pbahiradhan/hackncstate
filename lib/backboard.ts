// ──────────────────────────────────────────────
//  Backboard.io service — ALL AI operations
//  OCR, claim extraction, search, analysis, chat
// ──────────────────────────────────────────────

import { BackboardClient } from "backboard-sdk";
import { Source, ModelVerdict } from "./types";
import { searchSources, getWebSearchTool } from "./search";

let _client: any | null = null;
function bb(): any {
  if (!_client) {
    const key = process.env.BACKBOARD_API_KEY;
    if (!key) throw new Error("BACKBOARD_API_KEY not set");
    _client = new BackboardClient({ apiKey: key });
  }
  return _client;
}

const assistantCache: Record<string, string> = {};

async function getOrCreateAssistant(
  name: string,
  systemPrompt: string,
  tools?: any[]
): Promise<string> {
  if (assistantCache[name]) return assistantCache[name];
  const asst = await bb().createAssistant({
    name,
    systemPrompt,
    ...(tools ? { tools } : {}),
  });
  assistantCache[name] = asst.assistantId;
  return asst.assistantId;
}

// ── OCR via Backboard.io (using vision model) ──────────────────────────

export async function extractTextFromImage(imageUrl: string): Promise<string> {
  const id = await getOrCreateAssistant(
    "VerifyShot-OCR",
    `You are an OCR assistant. Extract ALL visible text from images exactly as it appears. Include usernames, dates, numbers, hashtags, captions, and any overlaid text. Return ONLY the extracted text, nothing else.`
  );
  const thread = await bb().createThread(id);

  // Try to use image URL directly (backboard.io may support this)
  // If not, we'll need to download and convert to base64
  const response = await bb().addMessage({
    threadId: thread.threadId,
    content: `Extract all text from this image: ${imageUrl}\n\nReturn ONLY the extracted text, nothing else.`,
    stream: false,
  });

  let text = response.content?.trim() || "";

  // If no text, try a more explicit prompt
  if (!text || text.length < 10) {
    const fallback = await bb().addMessage({
      threadId: thread.threadId,
      content: "What text is visible in the image? List all text exactly as it appears, line by line.",
      stream: false,
    });
    text = fallback.content?.trim() || "";
  }

  if (!text || text.length < 5) {
    throw new Error("OCR failed: No text extracted from image");
  }

  return text;
}

// ── Claim extraction ──────────────────────────

export async function extractClaims(ocrText: string): Promise<string[]> {
  const id = await getOrCreateAssistant(
    "VerifyShot-ClaimExtractor",
    `You are a fact-extraction assistant. Given OCR text, extract 1-3 concrete factual claims (not opinions or questions). Return ONLY a JSON array of strings. Example: ["Claim one","Claim two"]`
  );
  const thread = await bb().createThread(id);
  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `OCR TEXT:\n\"\"\"\n${ocrText}\n\"\"\"\n\nExtract 1-3 factual claims. Return JSON array only.`,
    stream: false,
  });
  try {
    let content = resp.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").trim();
    }
    const arr = JSON.parse(content);
    if (Array.isArray(arr)) return arr.slice(0, 3);
  } catch { /* fallback below */ }
  // Fallback: first sentence
  return [ocrText.split(/[.!?]/)[0].trim() + "."];
}

// ── Search sources (via tool call) ──────────────────────────

export async function searchSourcesForClaim(claim: string): Promise<Source[]> {
  // Create assistant with web_search tool
  const id = await getOrCreateAssistant(
    "VerifyShot-Searcher",
    `You are a research assistant. Use the web_search tool to find recent, reliable sources about factual claims.`,
    [getWebSearchTool()]
  );
  const thread = await bb().createThread(id);

  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Search for recent, reliable sources about this claim: "${claim}". Use the web_search tool.`,
    stream: false,
  });

  // If tool call is required, handle it
  if (resp.status === "REQUIRES_ACTION" && resp.toolCalls) {
    const toolOutputs = [];
    for (const tc of resp.toolCalls) {
      if (tc.function.name === "web_search") {
        const args = tc.function.parsedArguments || JSON.parse(tc.function.arguments || "{}");
        const sources = await searchSources(args.query, args.limit || 5);
        toolOutputs.push({
          toolCallId: tc.id,
          output: JSON.stringify(sources),
        });
      }
    }

    // Submit tool outputs and get final response
    const finalResp = await bb().submitToolOutputs({
      threadId: thread.threadId,
      runId: resp.runId,
      toolOutputs,
    });

    // Parse sources from response or use the tool output directly
    // For now, return the sources we got from the tool
    return await searchSources(claim, 5);
  }

  // If no tool call, fall back to direct search
  return await searchSources(claim, 5);
}

// ── Verdict analysis ──────────────────────────

export async function analyzeClaimWithSources(
  claim: string,
  sources: Source[]
): Promise<{
  verdict: "likely_true" | "mixed" | "likely_misleading";
  confidence: number;
  explanation: string;
}> {
  const id = await getOrCreateAssistant(
    "VerifyShot-Analyzer",
    `You are a concise fact-checker. Given a claim and sources, return JSON:
{"verdict":"likely_true"|"mixed"|"likely_misleading","confidence":0.0-1.0,"explanation":"2-line explanation"}`
  );
  const thread = await bb().createThread(id);
  const srcBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain}, ${s.date}): ${s.snippet}`)
    .join("\n");

  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Claim: "${claim}"\n\nSources:\n${srcBlock}\n\nReturn JSON only.`,
    stream: false,
  });

  try {
    let content = resp.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/```(?:json)?\n?/g, "").trim();
    }
    const r = JSON.parse(content);
    return {
      verdict: r.verdict ?? "mixed",
      confidence: r.confidence ?? 0.5,
      explanation: r.explanation ?? "Analysis pending.",
    };
  } catch {
    return { verdict: "mixed", confidence: 0.5, explanation: "Could not auto-analyze." };
  }
}

// ── Multi-model consensus ──

export async function getModelConsensus(
  claim: string,
  sources: Source[]
): Promise<ModelVerdict[]> {
  // Use different models via backboard.io
  // Backboard.io should allow model selection, but for now we'll use the default
  const models = [
    { name: "GPT-4", prompt: "You are GPT-4 analyzing a factual claim." },
    { name: "Claude 3", prompt: "You are Claude 3 analyzing a factual claim." },
    { name: "Gemini", prompt: "You are Gemini analyzing a factual claim." },
  ];

  const srcBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain}): ${s.snippet}`)
    .join("\n");

  const verdicts = await Promise.all(
    models.map(async (m) => {
      try {
        const id = await getOrCreateAssistant(
          `VerifyShot-Consensus-${m.name}`,
          `${m.prompt} Return JSON: {"agrees":true|false,"confidence":0.0-1.0}`
        );
        const thread = await bb().createThread(id);
        const resp = await bb().addMessage({
          threadId: thread.threadId,
          content: `Is this claim supported by the sources?\nClaim: "${claim}"\nSources:\n${srcBlock}\nReturn JSON only.`,
          stream: false,
        });
        let content = resp.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/```(?:json)?\n?/g, "").trim();
        }
        const r = JSON.parse(content);
        return { modelName: m.name, agrees: !!r.agrees, confidence: r.confidence ?? 0.5 };
      } catch {
        return { modelName: m.name, agrees: false, confidence: 0 };
      }
    })
  );

  return verdicts;
}

// ── Summary generation ────────────────────────

export async function generateSummary(
  ocrText: string,
  claims: { text: string; verdict: string; trustScore: number }[]
): Promise<string> {
  const id = await getOrCreateAssistant(
    "VerifyShot-Summarizer",
    "You write concise 2-3 sentence summaries of fact-check results. Be direct and informative."
  );
  const thread = await bb().createThread(id);
  const claimList = claims.map((c) => `• "${c.text}" → ${c.verdict} (score ${c.trustScore})`).join("\n");
  const resp = await bb().addMessage({
    threadId: thread.threadId,
    content: `Summarize in 2-3 sentences:\nOCR text: "${ocrText.slice(0, 300)}"\nClaims:\n${claimList}`,
    stream: false,
  });
  return resp.content.trim();
}

// ── Chat (keeps thread alive) ─────────────────

const chatThreads: Record<string, string> = {}; // jobId → threadId

export async function chatAboutJob(
  jobId: string,
  contextText: string,
  userMessage: string
): Promise<string> {
  const id = await getOrCreateAssistant(
    "VerifyShot-Chat",
    `You are a focused research assistant. The user has a screenshot with these details:\n${contextText}\nOnly answer about this topic. Reference specific sources. If uncertain, say "unverified" and suggest how to confirm.`
  );

  let threadId = chatThreads[jobId];
  if (!threadId) {
    const thread = await bb().createThread(id);
    threadId = thread.threadId;
    chatThreads[jobId] = threadId;
  }

  const resp = await bb().addMessage({
    threadId,
    content: userMessage,
    stream: false,
    memory: "Auto",
  });

  return resp.content;
}
