import { useCallback, useState } from 'react';
import { uploadVideo, fetchJobStatus } from '@/services/api';

export function useVideo() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [progress, setProgress] = useState(0);

  const processVideo = useCallback(async (file: File) => {
    setStatus('uploading');
    const result = await uploadVideo(file);
    const id = result.data.job_id as string;
    setJobId(id);
    setStatus('queued');

    const interval = setInterval(async () => {
      const job = await fetchJobStatus(id);
      setStatus(job.status as string);
      setProgress(Number(job.progress) || 0);
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  return { jobId, status, progress, processVideo };
}
