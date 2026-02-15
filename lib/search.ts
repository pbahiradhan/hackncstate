// ──────────────────────────────────────────────
//  Web Search — Perplexity sonar-pro via Backboard.io
//  Built-in web search, no separate API keys needed.
//  Legacy Google Custom Search fallback kept for optional use.
// ──────────────────────────────────────────────

import { Source } from "./types";

// Domain reputation → credibility score
const DOMAIN_SCORES: Record<string, number> = {
  // Wire services (highest)
  "reuters.com": 0.95, "apnews.com": 0.95, "ap.org": 0.95,
  // International broadsheets
  "bbc.com": 0.92, "bbc.co.uk": 0.92,
  "nytimes.com": 0.90, "washingtonpost.com": 0.88,
  "theguardian.com": 0.88, "wsj.com": 0.88,
  "economist.com": 0.90, "ft.com": 0.90,
  // Business / finance
  "cnbc.com": 0.85, "bloomberg.com": 0.88, "forbes.com": 0.78,
  "businessinsider.com": 0.72, "marketwatch.com": 0.78,
  "finance.yahoo.com": 0.72, "barrons.com": 0.82,
  // Science / academic
  "nature.com": 0.95, "science.org": 0.95, "sciencedirect.com": 0.92,
  "pubmed.ncbi.nlm.nih.gov": 0.95, "arxiv.org": 0.85,
  "scholar.google.com": 0.85, "nih.gov": 0.92,
  // US TV networks
  "cnn.com": 0.75, "nbcnews.com": 0.75, "abcnews.go.com": 0.75,
  "cbsnews.com": 0.75, "foxnews.com": 0.70, "msnbc.com": 0.72,
  // US newspapers / news
  "usatoday.com": 0.75, "latimes.com": 0.80, "chicagotribune.com": 0.78,
  "nypost.com": 0.65, "politico.com": 0.78, "thehill.com": 0.76,
  "axios.com": 0.78, "theatlantic.com": 0.82, "vox.com": 0.72,
  "npr.org": 0.88, "pbs.org": 0.88,
  // International
  "aljazeera.com": 0.78, "dw.com": 0.80, "france24.com": 0.80,
  "scmp.com": 0.75, "japantimes.co.jp": 0.78,
  // Fact-checkers
  "snopes.com": 0.88, "factcheck.org": 0.90, "politifact.com": 0.88,
  // Tech
  "techcrunch.com": 0.75, "theverge.com": 0.72, "arstechnica.com": 0.78,
  "wired.com": 0.75,
  // Reference
  "wikipedia.org": 0.70,
};

function credibilityForDomain(hostname: string): number {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  if (DOMAIN_SCORES[h]) return DOMAIN_SCORES[h];
  if (h.endsWith(".gov") || h.endsWith(".gov.uk")) return 0.92;
  if (h.endsWith(".edu")) return 0.85;
  if (h.endsWith(".org")) return 0.65;
  return 0.50;
}

// ──────────────────────────────────────────────
//  PRIMARY: AI-powered search via Perplexity
//  Uses Backboard.io → OpenRouter → Perplexity sonar-pro
//  Built-in web search, no separate API keys needed
// ──────────────────────────────────────────────

const BB_URL = "https://app.backboard.io/api";
const searchAssistantCache: { id?: string } = {};

function bbHeaders(contentType: string = "application/json"): Record<string, string> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) throw new Error("BACKBOARD_API_KEY not set");
  return {
    "X-API-Key": key,
    "Content-Type": contentType,
  };
}

async function getSearchAssistant(): Promise<string> {
  if (searchAssistantCache.id) return searchAssistantCache.id;

  // Check if assistant already exists
  const listRes = await fetch(`${BB_URL}/assistants`, {
    headers: bbHeaders(),
  });

  if (listRes.ok) {
    const assistants = (await listRes.json()) as any[];
    const existing = Array.isArray(assistants)
      ? assistants.find((a: any) => a.name === "VerifyShot-WebSearch-v1")
      : null;
    if (existing?.assistant_id) {
      searchAssistantCache.id = existing.assistant_id;
      return existing.assistant_id;
    }
  }

  // Create assistant — NO curly braces in system prompt (Backboard templates them)
  const systemPrompt = [
    "You are a source-finding API for fact-checking.",
    "When given a claim or text, search the web and return relevant sources.",
    "You MUST respond with ONLY a JSON array of source objects.",
    "Each source object has these keys:",
    "- \"title\" (string): the article title",
    "- \"url\" (string): the full URL of the article",
    "- \"domain\" (string): the domain name",
    "- \"snippet\" (string): a 1-2 sentence excerpt from the article",
    "- \"date\" (string): the publication date in YYYY-MM-DD format (best guess if unsure)",
    "",
    "Return 3-8 sources from reputable news outlets, fact-checkers, or academic sources.",
    "Prefer Reuters, AP, BBC, NYT, WashPost, Snopes, PolitiFact, FactCheck.org, and similar.",
    "Start your response with [ and end with ]. No other text.",
  ].join("\n");

  const createRes = await fetch(`${BB_URL}/assistants`, {
    method: "POST",
    headers: bbHeaders(),
    body: JSON.stringify({
      name: "VerifyShot-WebSearch-v1",
      system_prompt: systemPrompt,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create search assistant: ${createRes.status} - ${err}`);
  }

  const assistant = (await createRes.json()) as any;
  searchAssistantCache.id = assistant.assistant_id;
  return assistant.assistant_id;
}

/**
 * Search the web using Perplexity sonar-pro via Backboard.
 * Perplexity has built-in web search — no Google API keys needed.
 */
export async function searchWithAI(query: string, limit = 5): Promise<Source[]> {
  const key = process.env.BACKBOARD_API_KEY;
  if (!key) {
    console.warn("[Search-AI] No BACKBOARD_API_KEY — cannot search");
    return [];
  }

  console.log(`[Search-AI] Searching: "${query.slice(0, 80)}…" (limit: ${limit})`);

  try {
    const assistantId = await getSearchAssistant();

    // Create thread
    const threadRes = await fetch(`${BB_URL}/assistants/${assistantId}/threads`, {
      method: "POST",
      headers: bbHeaders(),
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      throw new Error(`Thread creation failed: ${threadRes.status}`);
    }

    const thread = (await threadRes.json()) as any;
    const threadId = thread.thread_id;

    // Send search request using Perplexity sonar-pro (has built-in web search)
    const userMessage = `Find ${limit} reliable news sources about this topic. Return ONLY a JSON array:\n\n"${query}"`;

    const formData = new URLSearchParams();
    formData.append("content", userMessage);
    formData.append("stream", "false");
    formData.append("memory", "Off");
    formData.append("llm_provider", "openrouter");
    formData.append("model_name", "perplexity/sonar-pro");

    const msgRes = await fetch(`${BB_URL}/threads/${threadId}/messages`, {
      method: "POST",
      headers: bbHeaders("application/x-www-form-urlencoded"),
      body: formData.toString(),
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      console.error(`[Search-AI] Message failed: ${msgRes.status} - ${errText}`);
      
      // Fallback: try with GPT-4o-mini (cheaper, no web search but can use knowledge)
      console.log(`[Search-AI] Falling back to GPT-4o-mini…`);
      const fallbackData = new URLSearchParams();
      fallbackData.append("content", userMessage);
      fallbackData.append("stream", "false");
      fallbackData.append("memory", "Off");
      fallbackData.append("llm_provider", "openai");
      fallbackData.append("model_name", "gpt-4o-mini");

      const fallbackRes = await fetch(`${BB_URL}/threads/${threadId}/messages`, {
        method: "POST",
        headers: bbHeaders("application/x-www-form-urlencoded"),
        body: fallbackData.toString(),
      });

      if (!fallbackRes.ok) {
        const err = await fallbackRes.text();
        throw new Error(`Fallback search also failed: ${fallbackRes.status} - ${err}`);
      }

      const fallbackResp = (await fallbackRes.json()) as any;
      return parseSourcesFromAI(fallbackResp.content || "");
    }

    const resp = (await msgRes.json()) as any;
    const content = resp.content || resp.message?.content || "";

    return parseSourcesFromAI(content);
  } catch (err: any) {
    console.error(`[Search-AI] Error:`, err.message);
    return [];
  }
}

/**
 * Parse AI response into Source[] objects.
 * Handles JSON arrays, markdown code blocks, and inline citations.
 */
function parseSourcesFromAI(content: string): Source[] {
  if (!content || content.length < 10) {
    console.warn("[Search-AI] Empty response");
    return [];
  }

  console.log(`[Search-AI] Parsing response (${content.length} chars)…`);

  let text = content.trim();

  // Remove markdown code blocks
  if (text.startsWith("```")) {
    text = text.replace(/```(?:json)?\n?/g, "").replace(/```\s*$/g, "").trim();
  }

  // Try to find JSON array
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      let jsonStr = text.substring(firstBracket, lastBracket + 1);
      // Fix Python-style escapes
      jsonStr = jsonStr
        .replace(/\\'/g, "'")
        .replace(/,\s*]/g, "]")
        .replace(/,\s*}/g, "}");
      
      const parsed = JSON.parse(jsonStr) as any[];
      const sources = parsed
        .filter((s: any) => s.url && s.title)
        .map((s: any): Source => {
          let hostname = "";
          try {
            hostname = new URL(s.url).hostname.replace(/^www\./, "");
          } catch {
            hostname = s.domain || "unknown";
          }
          return {
            title: s.title,
            url: s.url,
            domain: hostname,
            date: s.date || new Date().toISOString().split("T")[0],
            credibilityScore: credibilityForDomain(hostname),
            snippet: s.snippet || s.description || "",
          };
        });

      console.log(`[Search-AI] ✅ Parsed ${sources.length} source(s) from JSON`);
      return sources;
    } catch (e: any) {
      console.warn(`[Search-AI] JSON parse failed:`, e.message);
    }
  }

  // Fallback: extract URLs from plain text using regex
  const urlRegex = /https?:\/\/[^\s\)\"'<>]+/g;
  const urls = content.match(urlRegex) || [];
  const sources: Source[] = [];
  const seenDomains = new Set<string>();

  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (seenDomains.has(hostname)) continue;
      seenDomains.add(hostname);

      sources.push({
        title: `Source from ${hostname}`,
        url,
        domain: hostname,
        date: new Date().toISOString().split("T")[0],
        credibilityScore: credibilityForDomain(hostname),
        snippet: "",
      });
    } catch {
      // Invalid URL, skip
    }
  }

  console.log(`[Search-AI] Extracted ${sources.length} source(s) from URLs in text`);
  return sources;
}

// ──────────────────────────────────────────────
//  LEGACY: Google Custom Search (fallback)
// ──────────────────────────────────────────────

/**
 * Search using Google Custom Search API (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID).
 * Returns empty array if keys not configured or API fails.
 */
export async function searchSources(query: string, limit = 5): Promise<Source[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) {
    // Silently return empty — caller should use searchWithAI() instead
    return [];
  }
  
  console.log(`[Search-Google] Querying: "${query.slice(0, 80)}…" (limit: ${limit})`);

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${apiKey}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${Math.min(limit, 10)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Search-Google] API error ${res.status}: ${errText}`);
      return [];
    }

    const data = (await res.json()) as { items?: any[] };
    const items = data.items ?? [];
    console.log(`[Search-Google] Got ${items.length} result(s)`);
    return items.map((item: any): Source => {
      const hostname = new URL(item.link).hostname;
      return {
        title: item.title,
        url: item.link,
        domain: hostname.replace(/^www\./, ""),
        date:
          item.pagemap?.metatags?.[0]?.["article:published_time"] ??
          item.pagemap?.metatags?.[0]?.["og:updated_time"] ??
          new Date().toISOString().split("T")[0],
        credibilityScore: credibilityForDomain(hostname),
        snippet: item.snippet ?? "",
      };
    });
  } catch (error) {
    console.error("[Search-Google] Error:", error);
    return [];
  }
}

/**
 * Combined search: tries AI search first (Perplexity via Backboard),
 * falls back to Google if needed.
 */
export async function searchCombined(query: string, limit = 5): Promise<Source[]> {
  // Try AI search first (no Google API needed)
  let sources = await searchWithAI(query, limit);
  
  if (sources.length >= 2) {
    return sources;
  }
  
  // Fallback to Google (if configured)
  console.log(`[Search] AI search returned ${sources.length} result(s), trying Google…`);
  const googleSources = await searchSources(query, limit);
  
  // Merge and deduplicate
  const seenUrls = new Set(sources.map(s => s.url));
  for (const gs of googleSources) {
    if (!seenUrls.has(gs.url)) {
      seenUrls.add(gs.url);
      sources.push(gs);
    }
  }
  
  return sources;
}

/**
 * Tool definition for Backboard.io deep research assistants.
 */
export function getWebSearchTool() {
  return {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for recent, reliable sources about a factual claim. Returns articles with title, URL, domain, date, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query about the claim",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 5)",
            default: 5,
          },
        },
        required: ["query"],
      },
    },
  };
}
