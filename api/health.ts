// GET /api/health — diagnostic endpoint
// Shows which env vars are set (without revealing values)

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const envCheck = {
      BACKBOARD_API_KEY: !!process.env.BACKBOARD_API_KEY,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      GOOGLE_SEARCH_API_KEY: !!process.env.GOOGLE_SEARCH_API_KEY,
      GOOGLE_SEARCH_ENGINE_ID: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
    };

    const allRequired = envCheck.BACKBOARD_API_KEY && envCheck.GEMINI_API_KEY && envCheck.BLOB_READ_WRITE_TOKEN;
    const missingRequired = [];
    if (!envCheck.BACKBOARD_API_KEY) missingRequired.push("BACKBOARD_API_KEY");
    if (!envCheck.GEMINI_API_KEY) missingRequired.push("GEMINI_API_KEY");
    if (!envCheck.BLOB_READ_WRITE_TOKEN) missingRequired.push("BLOB_READ_WRITE_TOKEN");

    const missingOptional = [];
    if (!envCheck.GOOGLE_SEARCH_API_KEY) missingOptional.push("GOOGLE_SEARCH_API_KEY");
    if (!envCheck.GOOGLE_SEARCH_ENGINE_ID) missingOptional.push("GOOGLE_SEARCH_ENGINE_ID");

    // Check API key lengths (basic validation)
    let backboardKeyValid = false;
    if (envCheck.BACKBOARD_API_KEY) {
      const key = process.env.BACKBOARD_API_KEY || "";
      backboardKeyValid = key.length >= 10;
    }

    let geminiKeyValid = false;
    if (envCheck.GEMINI_API_KEY) {
      const key = process.env.GEMINI_API_KEY || "";
      geminiKeyValid = key.length >= 10;
    }

    return res.status(200).json({
      status: allRequired ? "ready" : "misconfigured",
      timestamp: new Date().toISOString(),
      envVars: envCheck,
      keyValidation: {
        BACKBOARD_API_KEY: backboardKeyValid ? "valid_length" : envCheck.BACKBOARD_API_KEY ? "too_short" : "not_set",
        GEMINI_API_KEY: geminiKeyValid ? "valid_length" : envCheck.GEMINI_API_KEY ? "too_short" : "not_set",
      },
      missingRequired: missingRequired.length > 0 ? missingRequired : undefined,
      missingOptional: missingOptional.length > 0 ? missingOptional : undefined,
      message: allRequired
        ? "All required environment variables are set. ✅" + (missingOptional.length > 0
          ? ` Optional missing: ${missingOptional.join(", ")} (web search won't work without these).`
          : " All optional vars also set.")
        : `Missing required env vars: ${missingRequired.join(", ")}. Set these in Vercel → Settings → Environment Variables.`,
    });
  } catch (err: any) {
    console.error("[/api/health] Error:", err.message);
    return res.status(500).json({
      status: "error",
      error: err.message || "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
