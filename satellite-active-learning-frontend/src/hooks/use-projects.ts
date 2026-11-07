'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
import type { CreateProjectInput, LabelInput } from '@/types';
export const keys = {
  projects: ['projects'] as const,
  dataset: (id: string) => ['project', id, 'dataset'] as const,
  samples: (id: string) => ['project', id, 'samples'] as const,
  metrics: (id: string) => ['project', id, 'metrics'] as const,
};
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.projects });
}
export function useDatasets(id: string) {
  return useQuery({ queryKey: keys.dataset(id), queryFn: () => api.dataset(id), enabled: !!id });
}
export function useSamples(id: string) {
  return useQuery({
    queryKey: keys.samples(id),
    queryFn: () => api.predictions(id),
    enabled: !!id,
  });
}
export function useMetrics(id: string) {
  return useQuery({ queryKey: keys.metrics(id), queryFn: () => api.metrics(id), enabled: !!id });
}
export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useQueryBatch(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ batchSize, strategy }: { batchSize: number; strategy: string }) =>
      api.query(id, batchSize, strategy),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.samples(id) }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useSaveLabels(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (labels: LabelInput[]) => api.labels(id, labels),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['project', id] }),
        client.invalidateQueries({ queryKey: keys.projects }),
      ]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useTrain(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.train(id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['project', id] }),
        client.invalidateQueries({ queryKey: keys.projects }),
      ]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useUpload(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      preview,
      onProgress,
    }: {
      file: File;
      preview: Blob | null;
      onProgress: (n: number) => void;
    }) => api.upload(id, file, preview, onProgress),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.dataset(id) });
      await client.invalidateQueries({ queryKey: keys.projects });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useDeleteDataset(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (datasetId: string) => api.deleteDataset(id, datasetId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.dataset(id) }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
