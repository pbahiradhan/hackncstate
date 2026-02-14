// ──────────────────────────────────────────────
//  Web Search — implemented as a tool function
//  that Backboard.io assistants can call
//  ──────────────────────────────────────────────

import { Source } from "./types";

// Domain reputation → credibility score
const DOMAIN_SCORES: Record<string, number> = {
  "reuters.com": 0.95, "apnews.com": 0.95, "ap.org": 0.95,
  "bbc.com": 0.92, "bbc.co.uk": 0.92,
  "nytimes.com": 0.90, "washingtonpost.com": 0.88,
  "theguardian.com": 0.88, "wsj.com": 0.88,
  "economist.com": 0.90, "nature.com": 0.95,
  "science.org": 0.95, "sciencedirect.com": 0.92,
  "cnn.com": 0.75, "nbcnews.com": 0.75, "abcnews.go.com": 0.75,
  "cbsnews.com": 0.75, "foxnews.com": 0.70,
  "politico.com": 0.78, "thehill.com": 0.76,
  "snopes.com": 0.88, "factcheck.org": 0.90, "politifact.com": 0.88,
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
    console.warn("Google Search keys not set – assistant will work without web sources");
    return [];
  }

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${apiKey}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}` +
    `&num=${Math.min(limit, 10)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Google Search error:", await res.text());
      return [];
    }

    // In TS 5.5+ / stricter lib.dom typings, Response.json() returns `unknown`.
    // We only need a minimal shape here.
    const data = (await res.json()) as { items?: any[] };
    return (data.items ?? []).map((item: any): Source => {
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
