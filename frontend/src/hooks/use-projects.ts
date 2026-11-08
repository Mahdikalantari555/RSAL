'use client';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
import { useReviewQueue } from '@/stores/review-queue';
import type {
  CreateProjectInput,
  LabelInput,
  MapLayer,
  Sample,
  UncertaintyMethod,
} from '@/types';
export const keys = {
  projects: ['projects'] as const,
  dataset: (id: string) => ['project', id, 'dataset'] as const,
  labels: (id: string) => ['project', id, 'labels'] as const,
  metrics: (id: string) => ['project', id, 'metrics'] as const,
  mapField: (
    id: string,
    layer: MapLayer,
    method: UncertaintyMethod,
    datasetId: string | undefined,
  ) => ['project', id, 'map', layer, method, datasetId ?? 'all'] as const,
};

/**
 * A model-derived map layer. Keyed by dataset + layer + method so switching the
 * uncertainty method or the active dataset reuses or refetches exactly one field.
 */
export function useMapField(
  id: string,
  options: {
    layer: MapLayer;
    method: UncertaintyMethod;
    datasetId: string | undefined;
    enabled: boolean;
  },
) {
  return useQuery({
    queryKey: keys.mapField(id, options.layer, options.method, options.datasetId),
    queryFn: () => api.mapField(id, options),
    enabled: !!id && options.enabled,
    staleTime: 60_000,
    retry: 0,
  });
}
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: api.projects });
}
export function useDatasets(id: string) {
  return useQuery({ queryKey: keys.dataset(id), queryFn: () => api.dataset(id), enabled: !!id });
}
const EMPTY: Sample[] = [];
/**
 * Review queue (persisted locally) merged with the backend's saved labels.
 * Saved labels make labeled patches visible on the map and correctable;
 * batch entries win on id collisions so positions/predictions stay intact.
 */
export function useSamples(id: string) {
  const batch = useReviewQueue((s) => s.batches[id]) ?? EMPTY;
  const saved = useQuery({
    queryKey: keys.labels(id),
    queryFn: () => api.savedLabels(id),
    enabled: !!id,
  });
  const data = useMemo(() => {
    const savedLabels = saved.data ?? EMPTY;
    const byId = new Map(savedLabels.map((s) => [s.id, s]));
    const merged: Sample[] = batch.map((s) => {
      const stored = byId.get(s.id);
      return stored
        ? { ...s, status: 'labeled' as const, label: stored.label, saved: true }
        : s;
    });
    const batchIds = new Set(batch.map((s) => s.id));
    for (const s of savedLabels) if (!batchIds.has(s.id)) merged.push(s);
    return merged;
  }, [batch, saved.data]);
  return {
    data,
    isLoading: !!id && saved.isLoading,
    error: saved.error,
    refetch: saved.refetch,
  };
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
  const setBatch = useReviewQueue((s) => s.setBatch);
  return useMutation({
    mutationFn: ({
      batchSize,
      strategy,
      datasetId,
    }: {
      batchSize: number;
      strategy: string;
      datasetId?: string;
    }) => api.query(id, batchSize, strategy, datasetId),
    onSuccess: (result) => setBatch(id, result.samples),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useSaveLabels(id: string) {
  const client = useQueryClient();
  const applyDrafts = useReviewQueue((s) => s.applyDrafts);
  return useMutation({
    mutationFn: (labels: LabelInput[]) => api.labels(id, labels),
    onSuccess: async (_result, labels) => {
      applyDrafts(id, labels);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['project', id] }),
        client.invalidateQueries({ queryKey: keys.projects }),
      ]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
export function useDeleteLabel(id: string) {
  const client = useQueryClient();
  const revertSample = useReviewQueue((s) => s.revertSample);
  return useMutation({
    mutationFn: (sampleId: string) => api.deleteLabel(id, sampleId),
    onSuccess: async (_result, sampleId) => {
      revertSample(id, sampleId);
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
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (n: number) => void }) =>
      api.upload(id, file, onProgress),
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
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['project', id] }),
        client.invalidateQueries({ queryKey: keys.projects }),
      ]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
