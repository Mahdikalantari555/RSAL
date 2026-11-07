export interface ClassDefinition {
  id: string;
  name: string;
  color: string;
}
export type ProjectStatus = 'unlabeled' | 'in_progress' | 'completed';
export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  classes: ClassDefinition[];
  createdAt: string;
  iteration: number;
  accuracy: number;
  f1: number;
  labeledCount: number;
  totalSamples: number;
  modelVersion: string;
}
export type Bounds = [number, number, number, number];
export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  size: number;
  bands: number;
  width: number;
  height: number;
  resolution: string;
  crs: string;
  /** WGS84 [w, s, e, n]; for pixel-space scenes [0, 0, width, height]. */
  bounds: Bounds;
  /** True when the scene has no usable CRS: displayed with Leaflet CRS.Simple. */
  pixelSpace: boolean;
  url: string;
  previewUrl: string | null;
  createdAt: string;
}
export interface SampleGeometry {
  type: 'Point' | 'Polygon';
  coordinates: number[] | number[][][];
}
export interface Sample {
  id: string;
  projectId: string;
  lat: number;
  lng: number;
  prediction: string;
  confidence: number;
  uncertainty: number;
  status: 'pending' | 'labeled' | 'skipped';
  label: string | null;
  note: string;
  iteration: number;
  batchIndex: number;
  /** Display-space geometry (WGS84, or pixel-display when the scene has no CRS). */
  geometry: SampleGeometry | null;
  source: 'query' | 'manual' | 'import';
  datasetId?: string;
  /** True pixel center in the source raster, when known. */
  pixel?: { x: number; y: number };
  /** Display-space patch rectangle [w, s, e, n]. */
  bbox?: Bounds;
  /** True when the backend has a stored label for this sample. */
  saved?: boolean;
}
export interface LabelInput {
  sampleId: string;
  label: string | null;
  status: 'labeled' | 'skipped';
  note: string;
  lat?: number;
  lng?: number;
  geometry?: SampleGeometry | null;
  datasetId?: string;
  pixel?: { x: number; y: number };
}
export interface Iteration {
  id: string;
  projectId: string;
  number: number;
  accuracy: number;
  f1: number;
  sampleCount: number;
  labeledCount: number;
  createdAt: string;
}
export interface ClassMetrics {
  name: string;
  color: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}
export interface Metrics {
  accuracy: number;
  f1: number;
  labeledCount: number;
  totalSamples: number;
  iteration: number;
  curve: Iteration[];
  distribution: { name: string; color: string; value: number }[];
  confusionMatrix: number[][];
  perClass: ClassMetrics[];
  evaluation: string;
}
export interface CreateProjectInput {
  name: string;
  description: string;
  classes: ClassDefinition[];
}
export type WorkspaceView = 'projects' | 'datasets' | 'learning' | 'analytics';
export type DrawingTool = 'pan' | 'point' | 'polygon' | 'rectangle';
export type BandMode = 'true-color' | 'false-color' | 'ndvi' | 'custom';
export interface RasterMetadata {
  bands: number;
  width: number;
  height: number;
  resolution: string;
  crs: string;
  bounds: Bounds | null;
}
