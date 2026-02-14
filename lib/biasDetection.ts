// ──────────────────────────────────────────────
//  Bias detection via 3 Backboard.io assistants
//  with different perspective prompts + memory
// ──────────────────────────────────────────────

import { BackboardClient } from "backboard-sdk";
import { BiasSignals } from "./types";

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

async function getOrCreate(name: string, prompt: string): Promise<string> {
  if (assistantCache[name]) return assistantCache[name];
  const a = await bb().createAssistant({ name, systemPrompt: prompt });
  assistantCache[name] = a.assistantId;
  return a.assistantId;
}

const PERSPECTIVES = [
  {
    name: "VerifyShot-Bias-Progressive",
    prompt: `You are a media-bias analyst with deep knowledge of progressive/left-leaning framing.
Analyze the claim for political bias & sensationalism.
Return JSON only: {"bias":<-1 to 1>,"sensationalism":<0 to 1>,"reasoning":"<short>"}`,
  },
  {
    name: "VerifyShot-Bias-Conservative",
    prompt: `You are a media-bias analyst with deep knowledge of conservative/right-leaning framing.
Analyze the claim for political bias & sensationalism.
Return JSON only: {"bias":<-1 to 1>,"sensationalism":<0 to 1>,"reasoning":"<short>"}`,
  },
  {
    name: "VerifyShot-Bias-International",
    prompt: `You are a neutral international media analyst from a non-US perspective.
Analyze the claim for political bias & sensationalism objectively.
Return JSON only: {"bias":<-1 to 1>,"sensationalism":<0 to 1>,"reasoning":"<short>"}`,
  },
];

export async function detectBias(claim: string): Promise<BiasSignals> {
  // Run all 3 perspectives in parallel
  const results = await Promise.all(
    PERSPECTIVES.map(async (p) => {
      try {
        const id = await getOrCreate(p.name, p.prompt);
        const thread = await bb().createThread(id);
        const resp = await bb().addMessage({
          threadId: thread.threadId,
          content: `Analyze this claim:\n"${claim}"`,
          stream: false,
          memory: "Auto",
        });
        let content = resp.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/```(?:json)?\n?/g, "").trim();
        }
        return JSON.parse(content) as { bias: number; sensationalism: number; reasoning: string };
      } catch {
        return { bias: 0, sensationalism: 0.3, reasoning: "Unable to assess" };
      }
    })
  );

  // Aggregate
  const avgBias = results.reduce((s, r) => s + r.bias, 0) / results.length;
  const avgSens = results.reduce((s, r) => s + r.sensationalism, 0) / results.length;
  const reasons = results.map((r) => r.reasoning).filter(Boolean);

  let overallBias: BiasSignals["overallBias"];
  if (avgBias < -0.5) overallBias = "left";
  else if (avgBias < -0.15) overallBias = "slight_left";
  else if (avgBias > 0.5) overallBias = "right";
  else if (avgBias > 0.15) overallBias = "slight_right";
  else overallBias = "center";

  return {
    politicalBias: Math.round(avgBias * 100) / 100,
    sensationalism: Math.round(avgSens * 100) / 100,
    overallBias,
    explanation: reasons[0] || "No significant bias detected.",
  };
}
