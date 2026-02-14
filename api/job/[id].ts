// GET /api/job/[id] - Get job status and results

import { getJobStatus } from '../../lib/jobStore';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const jobStatus = getJobStatus(id);

    if (!jobStatus) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.status(200).json(jobStatus);
  } catch (error: any) {
    console.error('Job status error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get job status' });
  }
}
