// ──────────────────────────────────────────────
//  Web Search — implemented as a tool function
//  that Backboard.io assistants can call
//  ──────────────────────────────────────────────

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

/**
 * Search the web for sources about a claim.
 * This function is called by Backboard.io assistants via tool calls.
 * 
 * If Google Search API keys are provided, use them.
 * Otherwise, return empty array (assistant can still work without sources).
 */
export async function searchSources(query: string, limit = 5): Promise<Source[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  // If no search API keys, return empty (backboard.io can still analyze)
  if (!apiKey || !cx) {
    console.warn("[Search] ⚠️ Missing keys — GOOGLE_SEARCH_API_KEY:", apiKey ? "✅ set" : "❌ NOT SET",
      "GOOGLE_SEARCH_ENGINE_ID:", cx ? "✅ set" : "❌ NOT SET");
    return [];
  }
  
  console.log(`[Search] Querying: "${query.slice(0, 80)}…" (limit: ${limit})`);

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${apiKey}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${Math.min(limit, 10)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Search] Google API error ${res.status}:`, errText);
      return [];
    }

    // In TS 5.5+ / stricter lib.dom typings, Response.json() returns `unknown`.
    // We only need a minimal shape here.
    const data = (await res.json()) as { items?: any[] };
    const items = data.items ?? [];
    console.log(`[Search] Got ${items.length} result(s)`);
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
    console.error("Search error:", error);
    return [];
  }
}

/**
 * Tool definition for Backboard.io assistants to use web search.
 * This is passed to assistants so they can call searchSources().
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
            description: "Search query about the claim (e.g., 'COVID vaccine effectiveness 2024')",
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
