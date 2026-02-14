// POST /api/analyze
// Accepts: { imageUrl: string }   OR   { image: "<base64>" }
// Returns: full AnalysisResult JSON synchronously

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { analyzeImage } from "../lib/analyzer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    let { imageUrl, image, filename } = req.body ?? {};
    const jobId = uuidv4();

    // If base64 image provided, upload to Vercel Blob first
    if (!imageUrl && image) {
      const buffer = Buffer.from(image, "base64");
      const name = filename || `screenshot-${Date.now()}.jpg`;
      const blob = await put(name, buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });
      imageUrl = blob.url;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl or image (base64) required" });
    }

    // Run full analysis synchronously
    const result = await analyzeImage(imageUrl, jobId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: err.message });
  }
}
