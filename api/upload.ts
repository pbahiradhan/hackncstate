// POST /api/upload
// Accepts: { image: "<base64>", filename?: "screenshot.jpg" }
// Returns: { imageUrl, jobId }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { createJob } from "../lib/jobStore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { image, filename } = req.body ?? {};
    if (!image) return res.status(400).json({ error: "image (base64) is required" });

    const buffer = Buffer.from(image, "base64");
    const name = filename || `screenshot-${Date.now()}.jpg`;

    const blob = await put(name, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN!,
    });

    const jobId = uuidv4();
    createJob(jobId);

    return res.status(200).json({ imageUrl: blob.url, jobId });
  } catch (err: any) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: err.message });
  }
}
