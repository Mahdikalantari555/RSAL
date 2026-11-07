"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { IterationMetrics, PredictionsResponse, QueryBatch, Suggestion } from "@/types";

export function usePredictions(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.predictions(projectId ?? "unknown"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data } = await api.get<PredictionsResponse>(`/projects/${projectId}/predictions`);
      return data;
    },
  });
}

export function useQueryBatch(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { size?: number; force?: boolean; strategy?: string }) => {
      const { data } = await api.post<{
        batch: QueryBatch;
        suggestions: Suggestion[];
        poolRemaining: number;
        reused: boolean;
      }>(`/projects/${projectId}/query`, input);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.predictions(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useTrainModel(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { newLabels?: number } = {}) => {
      const { data } = await api.post<{ iteration: IterationMetrics; epochs: number }>(
        `/projects/${projectId}/train`,
        input,
      );
      return data.iteration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
