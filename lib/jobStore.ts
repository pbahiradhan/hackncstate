// ──────────────────────────────────────────────
//  Simple in-memory job store for MVP
//  (Replace with KV/Redis for production)
// ──────────────────────────────────────────────

import { JobStatus, AnalysisResult } from "./types";

const jobs = new Map<string, JobStatus>();

export function createJob(jobId: string): void {
  jobs.set(jobId, { status: "pending" });
}

export function setProgress(jobId: string, progress: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "processing";
    job.progress = progress;
  }
}

export function setJobResult(jobId: string, result: AnalysisResult): void {
  jobs.set(jobId, { status: "completed", result });
}

export function setJobError(jobId: string, error: string): void {
  jobs.set(jobId, { status: "error", error });
}

export function getJobStatus(jobId: string): JobStatus | null {
  return jobs.get(jobId) ?? null;
}
