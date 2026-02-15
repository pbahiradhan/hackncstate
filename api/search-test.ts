// GET /api/search-test?q=test+query
// Diagnostic endpoint to test Google Custom Search directly

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  const query = (req.query.q as string) || "latest news";

  // Step 1: Check env vars
  if (!apiKey) {
    return res.status(200).json({
      status: "error",
      issue: "GOOGLE_SEARCH_API_KEY is NOT SET",
      fix: "Go to Vercel → Settings → Environment Variables → add GOOGLE_SEARCH_API_KEY",
      howToGetKey: "console.cloud.google.com → APIs & Services → Credentials → Create Credentials → API Key",
    });
  }

  if (!cx) {
    return res.status(200).json({
      status: "error",
      issue: "GOOGLE_SEARCH_ENGINE_ID is NOT SET",
      fix: "Go to Vercel → Settings → Environment Variables → add GOOGLE_SEARCH_ENGINE_ID",
      howToGetId: "programmablesearchengine.google.com → Add → 'Search the entire web' → Create → copy the cx/Search Engine ID",
    });
  }

  // Step 2: Actually call Google
  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${apiKey}&cx=${cx}` +
    `&q=${encodeURIComponent(query)}&num=3`;

  try {
    const googleRes = await fetch(url);
    const body = await googleRes.text();

    if (!googleRes.ok) {
      let parsed: any = {};
      try { parsed = JSON.parse(body); } catch { /* raw text */ }
      const reason = parsed?.error?.errors?.[0]?.reason;
      const message = parsed?.error?.message;

      let diagnosis = "Unknown error";
      let fix = "";

      if (reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") {
        diagnosis = "RATE LIMITED — you've used all 100 free queries for today";
        fix = "Wait until midnight Pacific Time for the quota to reset, OR upgrade to a paid plan ($5/1000 queries) at console.cloud.google.com → APIs & Services → Custom Search JSON API → Quotas";
      } else if (reason === "keyInvalid") {
        diagnosis = "API KEY IS INVALID — the key doesn't exist or was deleted";
        fix = "Create a new key at console.cloud.google.com → APIs & Services → Credentials → Create Credentials → API Key";
      } else if (googleRes.status === 403) {
        diagnosis = "FORBIDDEN — the Custom Search JSON API is not enabled for this project";
        fix = "Go to console.cloud.google.com → APIs & Services → Library → search 'Custom Search JSON API' → click Enable";
      } else if (googleRes.status === 400) {
        diagnosis = "BAD REQUEST — the Search Engine ID (cx) may be invalid";
        fix = "Go to programmablesearchengine.google.com and verify your search engine exists. Copy the correct cx value.";
      }

      return res.status(200).json({
        status: "error",
        httpStatus: googleRes.status,
        diagnosis,
        fix,
        googleReason: reason || "none",
        googleMessage: message || body.slice(0, 500),
        keyPrefix: apiKey.slice(0, 6) + "…",
        cxPrefix: cx.slice(0, 6) + "…",
      });
    }

    // Success — show results
    const data = JSON.parse(body);
    const items = (data.items || []).slice(0, 3);

    return res.status(200).json({
      status: "working",
      query,
      totalResults: data.searchInformation?.totalResults || "0",
      resultCount: items.length,
      results: items.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: (item.snippet || "").slice(0, 200),
      })),
      keyPrefix: apiKey.slice(0, 6) + "…",
      cxPrefix: cx.slice(0, 6) + "…",
      message: "✅ Google Custom Search is working!",
    });
  } catch (err: any) {
    return res.status(200).json({
      status: "error",
      issue: "Network error calling Google API",
      error: err.message,
    });
  }
}
