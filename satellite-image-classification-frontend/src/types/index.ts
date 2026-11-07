/**
 * Shared domain types for the active-learning satellite labeling platform.
 * These types mirror the JSON contract used by the API layer (`/api/*`) and
 * are intentionally framework agnostic so they can be reused by a FastAPI
 * backend later on.
 */

export type ProjectStatus = "unlabeled" | "in_progress" | "completed";

export type LabelSource = "human" | "model" | "import" | "seed";

export type SampleStatus = "labeled" | "skipped";

export type SuggestionStatus = "pending" | "accepted" | "overridden" | "skipped";

export type BandPresetId =
  | "true_color"
  | "false_color"
  | "ndvi"
  | "uncertainty"
  | "custom_rgb";

export type DrawingTool = "pan" | "point" | "polygon" | "rectangle";

export interface ClassDefinition {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AreaOfInterest {
  center: [number, number];
  bounds: Bounds;
  zoom: number;
  label: string;
}

export type SampleGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: number[][][] };

export interface DataScene {
  id: string;
  projectId: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  bandCount: number;
  width: number;
  height: number;
  crs: string;
  resolutionM: number;
  bounds: Bounds;
  bands: string[];
  status: "ready" | "processing";
  sampleCount: number;
  createdAt: string;
}

export interface LabelledSample {
  id: string;
  projectId: string;
  sceneId: string | null;
  geometry: SampleGeometry;
  classId: string;
  source: LabelSource;
  confidence: number | null;
  note: string | null;
  status: SampleStatus;
  iteration: number;
  createdAt: string;
}

export interface Suggestion {
  id: string;
  projectId: string;
  batchId: string;
  lat: number;
  lng: number;
  predictedClassId: string;
  confidence: number;
  uncertainty: number;
  status: SuggestionStatus;
  note: string | null;
  createdAt: string;
}

export interface QueryBatch {
  id: string;
  projectId: string;
  iteration: number;
  size: number;
  labeledCount: number;
  status: "pending" | "submitted";
  createdAt: string;
}

export interface ClassMetric {
  classId: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
}

export interface IterationMetrics {
  id: string;
  projectId: string;
  iteration: number;
  accuracy: number;
  f1: number;
  kappa: number;
  precision: number;
  recall: number;
  labeledSamples: number;
  newLabels: number;
  trainSeconds: number;
  confusionMatrix: ConfusionMatrix;
  classMetrics: ClassMetric[];
  confidenceHistogram: number[];
  createdAt: string;
}

export interface ProjectStats {
  sceneCount: number;
  labeledSamples: number;
  skippedSamples: number;
  iterationCount: number;
  accuracy: number | null;
  f1: number | null;
  kappa: number | null;
  confidence: number | null;
  pendingSuggestions: number;
  lastTrainedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  numClasses: number;
  classes: ClassDefinition[];
  status: ProjectStatus;
  aoi: AreaOfInterest;
  createdAt: string;
  updatedAt: string;
  stats: ProjectStats;
}

export interface DashboardSummary {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalLabels: number;
  totalScenes: number;
  totalIterations: number;
  meanAccuracy: number | null;
  labeledThisWeek: number;
}

export interface ProjectsResponse {
  projects: Project[];
  summary: DashboardSummary;
}

export interface DatasetResponse {
  project: Project;
  scenes: DataScene[];
  samples: LabelledSample[];
  batches: QueryBatch[];
}

export interface PredictionsResponse {
  project: Project;
  batch: QueryBatch | null;
  suggestions: Suggestion[];
  samples: LabelledSample[];
  scenes: DataScene[];
  poolRemaining: number;
}

export interface LearningCurvePoint {
  iteration: number;
  labeledSamples: number;
  accuracy: number;
  f1: number;
  newLabels: number;
}

export interface ClassDistributionPoint {
  classId: string;
  name: string;
  color: string;
  count: number;
  suggested: number;
}

export interface ConfidenceHistoryPoint {
  iteration: number;
  labeledSamples: number;
  bins: number[];
  meanConfidence: number;
}

export interface MetricsResponse {
  project: Project;
  iterations: IterationMetrics[];
  latest: IterationMetrics | null;
  learningCurve: LearningCurvePoint[];
  classDistribution: ClassDistributionPoint[];
  confidenceHistory: ConfidenceHistoryPoint[];
}

export interface UploadMetadata {
  name: string;
  bandCount: number;
  width: number;
  height: number;
  crs: string;
  resolutionM: number;
  bands: string[];
  bounds?: Bounds;
}

export interface DraftLabel {
  suggestionId: string;
  status: "pending" | "accepted" | "overridden" | "skipped";
  classId: string | null;
  note: string;
}

export interface SamplePayload {
  geometry: SampleGeometry;
  classId: string;
  sceneId?: string | null;
  note?: string;
  source?: LabelSource;
  confidence?: number | null;
  status?: SampleStatus;
}

export interface ImportSample {
  geometry: SampleGeometry;
  classId: string;
  note?: string;
  confidence?: number | null;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  samples: LabelledSample[];
}

export interface CreateProjectInput {
  name: string;
  description: string;
  classes: string[];
  aoiLabel?: string;
}
