// POST /api/chat
// Accepts: { jobId, message, context }
// Returns: { reply: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chatAboutJob } from "../lib/backboard";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { jobId, message, context } = req.body ?? {};
    if (!jobId || !message) {
      return res.status(400).json({ error: "jobId and message are required" });
    }

    const reply = await chatAboutJob(jobId, context ?? "", message);
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: err.message });
  }
}
