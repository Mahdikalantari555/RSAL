"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  DataScene,
  DatasetResponse,
  ImportResult,
  ImportSample,
  LabelledSample,
  SamplePayload,
  UploadMetadata,
} from "@/types";

export function useDataset(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.dataset(projectId ?? "unknown"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data } = await api.get<DatasetResponse>(`/projects/${projectId}/dataset`);
      return data;
    },
  });
}

interface UploadVariables {
  file: File;
  metadata: UploadMetadata;
  onProgress?: (percent: number) => void;
}

export function useUploadScene(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, metadata, onProgress }: UploadVariables) => {
      const form = new FormData();
      form.append("file", file);
      form.append("metadata", JSON.stringify(metadata));
      const { data } = await api.post<{ scene: DataScene }>(
        `/projects/${projectId}/upload`,
        form,
        {
          onUploadProgress: (event) => {
            if (!onProgress) return;
            const total = event.total ?? file.size;
            onProgress(Math.min(99, Math.round((event.loaded / Math.max(total, 1)) * 100)));
          },
        },
      );
      return data.scene;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useImportLabels(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fileName?: string; samples: ImportSample[] }) => {
      const { data } = await api.post<ImportResult>(
        `/projects/${projectId}/labels/import`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataset(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.metrics(projectId) });
    },
  });
}

interface SubmitLabelsInput {
  batchId?: string | null;
  labels?: {
    suggestionId: string;
    status: "accepted" | "overridden" | "skipped";
    classId: string;
    note?: string;
  }[];
  samples?: SamplePayload[];
}

export function useSubmitLabels(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitLabelsInput) => {
      const { data } = await api.post<{
        inserted: number;
        samples: LabelledSample[];
        batchId: string | null;
      }>(`/projects/${projectId}/labels`, input);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useUpdateSample(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sampleId,
      ...patch
    }: {
      sampleId: string;
      classId?: string;
      note?: string | null;
      status?: "labeled" | "skipped";
    }) => {
      const { data } = await api.patch<{ sample: LabelledSample }>(
        `/projects/${projectId}/samples/${sampleId}`,
        patch,
      );
      return data.sample;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}

export function useDeleteSample(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sampleId: string) => {
      await api.delete(`/projects/${projectId}/samples/${sampleId}`);
      return sampleId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
}
