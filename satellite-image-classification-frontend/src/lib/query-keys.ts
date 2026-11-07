export const queryKeys = {
  projects: ["projects"] as const,
  project: (projectId: string) => ["projects", projectId] as const,
  dataset: (projectId: string) => ["projects", projectId, "dataset"] as const,
  predictions: (projectId: string) => ["projects", projectId, "predictions"] as const,
  metrics: (projectId: string) => ["projects", projectId, "metrics"] as const,
};
