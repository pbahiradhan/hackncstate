// POST /api/chat
// Accepts: { message, jobId?, context?, mode? }
// Returns: { reply: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatAboutJob } from "../lib/backboardHttp";

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { jobId, message, context, mode } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    if (!process.env.BACKBOARD_API_KEY) {
      return res.status(500).json({
        error: "Server misconfigured: BACKBOARD_API_KEY not set",
      });
    }

    console.log(`[/api/chat] mode=${mode || "standard"}, message="${(message as string).slice(0, 80)}…"`);

    const reply = await chatAboutJob(
      jobId || "text-query",
      context ?? "",
      message,
      mode ?? "standard"
    );

    console.log(`[/api/chat] Reply length: ${reply.length}`);
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("[/api/chat] Error:", err.message);
    console.error("[/api/chat] Stack:", err.stack);
    
    // Provide more helpful error messages
    let errorMsg = err.message || "Chat failed";
    let hint = "Check Vercel function logs for details";
    
    if (errorMsg.includes("BACKBOARD_API_KEY")) {
      hint = "Set BACKBOARD_API_KEY in Vercel → Settings → Environment Variables";
    } else if (errorMsg.includes("credits") || errorMsg.includes("quota")) {
      hint = "Check your Backboard.io account has credits available";
    } else if (errorMsg.includes("assistant")) {
      hint = "Backboard assistant creation failed. Check API key and account status.";
    } else if (errorMsg.includes("thread")) {
      hint = "Backboard thread creation failed. Check API key.";
    }
    
    return res.status(500).json({
      error: errorMsg,
      hint,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}
