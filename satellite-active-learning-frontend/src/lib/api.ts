import type {
  CreateProjectInput,
  Dataset,
  Iteration,
  LabelInput,
  Metrics,
  Project,
  Sample,
} from '@/types';
const BASE = '/api/projects';
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : typeof data.detail === 'string'
          ? data.detail
          : `Request failed (${response.status}).`,
    );
  return data as T;
}
export const api = {
  projects: () => request<Project[]>(''),
  createProject: (data: CreateProjectInput) =>
    request<Project>('', { method: 'POST', body: JSON.stringify(data) }),
  dataset: (id: string) => request<Dataset[]>(`/${id}/dataset`),
  predictions: (id: string) => request<Sample[]>(`/${id}/predictions`),
  metrics: (id: string) => request<Metrics>(`/${id}/metrics`),
  query: (id: string, batchSize: number, strategy: string) =>
    request<{ samples: Sample[]; existing: boolean }>(`/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ batchSize, strategy }),
    }),
  labels: (id: string, labels: LabelInput[]) =>
    request<{ saved: number }>(`/${id}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    }),
  train: (id: string) =>
    request<{ iteration: Iteration; demo: boolean }>(`/${id}/train`, {
      method: 'POST',
      body: '{}',
    }),
  deleteDataset: (id: string, datasetId: string) =>
    request<{ deleted: boolean }>(`/${id}/dataset/${datasetId}`, { method: 'DELETE' }),
  upload: (id: string, file: File, preview: Blob | null, onProgress: (progress: number) => void) =>
    new Promise<Dataset>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      if (preview) form.append('preview', preview, 'preview.png');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/${id}/upload`);
      xhr.timeout = 120000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 95));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve(data);
          } else reject(new Error(data.error ?? 'Upload failed.'));
        } catch {
          reject(new Error('The server returned an invalid response.'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error. Your file was not uploaded.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out. Try a smaller file.'));
      xhr.send(form);
    }),
};
