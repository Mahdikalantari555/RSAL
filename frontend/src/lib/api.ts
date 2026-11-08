import type {
  CreateProjectInput,
  Dataset,
  Iteration,
  LabelInput,
  MapExportFormat,
  MapField,
  MapLayer,
  Metrics,
  Project,
  Sample,
  UncertaintyMethod,
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
/** Query string for a map-layer request. */
function mapQuery(options: {
  layer: MapLayer;
  method?: UncertaintyMethod;
  datasetId?: string;
  iteration?: number;
}): string {
  const params = new URLSearchParams({ layer: options.layer });
  if (options.layer === 'uncertainty') params.set('method', options.method ?? 'entropy');
  if (options.datasetId) params.set('datasetId', options.datasetId);
  if (options.iteration !== undefined) params.set('iteration', String(options.iteration));
  return params.toString();
}

export const api = {
  projects: () => request<Project[]>(''),
  createProject: (data: CreateProjectInput) =>
    request<Project>('', { method: 'POST', body: JSON.stringify(data) }),
  dataset: (id: string) => request<Dataset[]>(`/${id}/dataset`),
  savedLabels: (id: string) => request<Sample[]>(`/${id}/labels`),
  metrics: (id: string) => request<Metrics>(`/${id}/metrics`),
  query: (id: string, batchSize: number, strategy: string, datasetId?: string) =>
    request<{ samples: Sample[]; existing: boolean }>(`/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ batchSize, strategy, ...(datasetId ? { datasetId } : {}) }),
    }),
  labels: (id: string, labels: LabelInput[]) =>
    request<{ saved: number }>(`/${id}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    }),
  deleteLabel: (id: string, sampleId: string) =>
    request<{ deleted: boolean }>(`/${id}/labels/${encodeURIComponent(sampleId)}`, {
      method: 'DELETE',
    }),
  train: (id: string) =>
    request<{ iteration: Iteration }>(`/${id}/train`, {
      method: 'POST',
      body: '{}',
    }),
  mapField: (id: string, options: Parameters<typeof mapQuery>[0]) =>
    request<MapField>(`/${id}/map?${mapQuery(options)}`),
  /** Download URL for a layer export; the browser handles the file itself. */
  mapExportUrl: (
    id: string,
    options: {
      layer: MapLayer | 'probability';
      format: MapExportFormat;
      method?: UncertaintyMethod;
      datasetId?: string;
      scale?: number;
    },
  ) => {
    const params = new URLSearchParams({ format: options.format });
    if (options.layer === 'uncertainty') params.set('method', options.method ?? 'entropy');
    if (options.layer === 'probability') params.set('layer', 'probability');
    if (options.datasetId) params.set('datasetId', options.datasetId);
    if (options.scale) params.set('scale', String(options.scale));
    return `${BASE}/${id}/map/export?${params.toString()}`;
  },
  deleteDataset: (id: string, datasetId: string) =>
    request<{ deleted: boolean }>(`/${id}/dataset/${datasetId}`, { method: 'DELETE' }),
  upload: (id: string, file: File, onProgress: (progress: number) => void) =>
    new Promise<Dataset>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/${id}/upload`);
      xhr.timeout = 180000;
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
