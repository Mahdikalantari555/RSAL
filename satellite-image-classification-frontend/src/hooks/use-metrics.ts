"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { MetricsResponse } from "@/types";

export function useMetrics(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.metrics(projectId ?? "unknown"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data } = await api.get<MetricsResponse>(`/projects/${projectId}/metrics`);
      return data;
    },
  });
}
