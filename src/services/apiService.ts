import { Operation, Job } from '../types/pdf';

class MockApiService {
  private jobs: Job[] = [];

  async uploadDocument(file: File): Promise<{ documentId: string; jobId: string }> {
    const jobId = Math.random().toString(36).substring(7);
    const documentId = 'doc_' + Math.random().toString(36).substring(7);
    
    const newJob: Job = {
      id: jobId,
      type: 'upload',
      status: 'queued',
      progress: 0,
      createdAt: Date.now()
    };
    
    this.jobs.push(newJob);
    this.simulateJob(jobId);
    
    return { documentId, jobId };
  }

  async compileDocument(documentId: string, ops: Operation[]): Promise<{ jobId: string }> {
    const jobId = Math.random().toString(36).substring(7);
    
    const newJob: Job = {
      id: jobId,
      type: 'compile',
      status: 'queued',
      progress: 0,
      createdAt: Date.now()
    };
    
    this.jobs.push(newJob);
    this.simulateJob(jobId);
    
    return { jobId };
  }

  private simulateJob(jobId: string) {
    let progress = 0;
    const interval = setInterval(() => {
      const job = this.jobs.find(j => j.id === jobId);
      if (!job) {
        clearInterval(interval);
        return;
      }

      if (progress === 0) job.status = 'running';
      
      progress += Math.random() * 30;
      if (progress >= 100) {
        progress = 100;
        job.status = 'succeeded';
        job.progress = 100;
        clearInterval(interval);
      } else {
        job.progress = progress;
      }
    }, 800);
  }

  getJobs(): Job[] {
    return [...this.jobs].sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const apiService = new MockApiService();
