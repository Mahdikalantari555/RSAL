import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  batches,
  iterations,
  projects,
  samples,
  scenes,
  suggestions,
  type BatchRow,
  type IterationRow,
  type ProjectRow,
  type SampleRow,
  type SceneRow,
  type SuggestionRow,
} from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { aoiFromPreset } from "@/lib/aoi";
import { colorForClass, slugifyClassId } from "@/lib/palette";
import { hashString, meanConfidence, round } from "@/lib/simulation";
import type {
  ClassDefinition,
  DataScene,
  DashboardSummary,
  DatasetResponse,
  IterationMetrics,
  LabelledSample,
  MetricsResponse,
  PredictionsResponse,
  Project,
  ProjectStats,
  ProjectsResponse,
  QueryBatch,
  Suggestion,
} from "@/types";

const iso = (value: Date | string): string => new Date(value).toISOString();

/* -------------------------------------------------------------------------- */
/* Serializers                                                                */
/* -------------------------------------------------------------------------- */

export function serializeScene(row: SceneRow, sampleCount = 0): DataScene {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    bandCount: row.bandCount,
    width: row.width,
    height: row.height,
    crs: row.crs,
    resolutionM: row.resolutionM,
    bounds: row.bounds,
    bands: row.bands,
    status: row.status,
    sampleCount,
    createdAt: iso(row.createdAt),
  };
}

export function serializeSample(row: SampleRow): LabelledSample {
  return {
    id: row.id,
    projectId: row.projectId,
    sceneId: row.sceneId,
    geometry: row.geometry,
    classId: row.classId,
    source: row.source,
    confidence: row.confidence,
    note: row.note,
    status: row.status,
    iteration: row.iteration,
    createdAt: iso(row.createdAt),
  };
}

export function serializeSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    projectId: row.projectId,
    batchId: row.batchId,
    lat: row.lat,
    lng: row.lng,
    predictedClassId: row.predictedClassId,
    confidence: row.confidence,
    uncertainty: row.uncertainty,
    status: row.status,
    note: row.note,
    createdAt: iso(row.createdAt),
  };
}

export function serializeBatch(row: BatchRow): QueryBatch {
  return {
    id: row.id,
    projectId: row.projectId,
    iteration: row.iteration,
    size: row.size,
    labeledCount: row.labeledCount,
    status: row.status,
    createdAt: iso(row.createdAt),
  };
}

export function serializeIteration(row: IterationRow): IterationMetrics {
  return {
    id: row.id,
    projectId: row.projectId,
    iteration: row.iteration,
    accuracy: row.accuracy,
    f1: row.f1,
    kappa: row.kappa,
    precision: row.precision,
    recall: row.recall,
    labeledSamples: row.labeledSamples,
    newLabels: row.newLabels,
    trainSeconds: row.trainSeconds,
    confusionMatrix: row.confusionMatrix,
    classMetrics: row.classMetrics,
    confidenceHistogram: row.confidenceHistogram,
    createdAt: iso(row.createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

function buildStats(input: {
  sceneCount: number;
  sampleRows: SampleRow[];
  iterationRows: IterationRow[];
  pendingCount: number;
}): ProjectStats {
  const labeled = input.sampleRows.filter((row) => row.status === "labeled");
  const skipped = input.sampleRows.filter((row) => row.status === "skipped");
  const latest = [...input.iterationRows].sort((a, b) => b.iteration - a.iteration)[0];
  const confidences = labeled
    .map((row) => row.confidence)
    .filter((value): value is number => typeof value === "number");

  return {
    sceneCount: input.sceneCount,
    labeledSamples: labeled.length,
    skippedSamples: skipped.length,
    iterationCount: input.iterationRows.length,
    accuracy: latest ? round(latest.accuracy, 4) : null,
    f1: latest ? round(latest.f1, 4) : null,
    kappa: latest ? round(latest.kappa, 4) : null,
    confidence:
      confidences.length > 0
        ? round(confidences.reduce((acc, value) => acc + value, 0) / confidences.length, 3)
        : null,
    pendingSuggestions: input.pendingCount,
    lastTrainedAt: latest ? iso(latest.createdAt) : null,
  };
}

export function serializeProject(row: ProjectRow, stats: ProjectStats): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    numClasses: row.numClasses,
    classes: row.classes,
    status: row.status,
    aoi: row.aoi,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    stats,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

interface ProjectContext {
  project: ProjectRow;
  sceneRows: SceneRow[];
  sampleRows: SampleRow[];
  iterationRows: IterationRow[];
  batchRows: BatchRow[];
  suggestionRows: SuggestionRow[];
}

async function loadContext(projectId: string): Promise<ProjectContext | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  const [sceneRows, sampleRows, iterationRows, batchRows, suggestionRows] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(asc(scenes.createdAt)),
    db.select().from(samples).where(eq(samples.projectId, projectId)).orderBy(desc(samples.createdAt)),
    db.select().from(iterations).where(eq(iterations.projectId, projectId)).orderBy(asc(iterations.iteration)),
    db.select().from(batches).where(eq(batches.projectId, projectId)).orderBy(desc(batches.createdAt)),
    db.select().from(suggestions).where(eq(suggestions.projectId, projectId)).orderBy(asc(suggestions.createdAt)),
  ]);

  return { project, sceneRows, sampleRows, iterationRows, batchRows, suggestionRows };
}

function withStats(context: ProjectContext): Project {
  const pending = context.suggestionRows.filter((row) => row.status === "pending").length;
  return serializeProject(
    context.project,
    buildStats({
      sceneCount: context.sceneRows.length,
      sampleRows: context.sampleRows,
      iterationRows: context.iterationRows,
      pendingCount: pending,
    }),
  );
}

export async function getDashboard(): Promise<ProjectsResponse> {
  await ensureSeeded();

  const projectRows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const ids = projectRows.map((row) => row.id);
  if (ids.length === 0) {
    const summary: DashboardSummary = {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalLabels: 0,
      totalScenes: 0,
      totalIterations: 0,
      meanAccuracy: null,
      labeledThisWeek: 0,
    };
    return { projects: [], summary };
  }

  const [sceneRows, sampleRows, iterationRows, suggestionRows] = await Promise.all([
    db.select().from(scenes).where(inArray(scenes.projectId, ids)),
    db.select().from(samples).where(inArray(samples.projectId, ids)),
    db.select().from(iterations).where(inArray(iterations.projectId, ids)),
    db.select().from(suggestions).where(inArray(suggestions.projectId, ids)),
  ]);

  const serialized = projectRows.map((row) => {
    const projectSamples = sampleRows.filter((sample) => sample.projectId === row.id);
    const projectIterations = iterationRows.filter((iter) => iter.projectId === row.id);
    const projectSuggestions = suggestionRows.filter((sugg) => sugg.projectId === row.id);
    return serializeProject(
      row,
      buildStats({
        sceneCount: sceneRows.filter((scene) => scene.projectId === row.id).length,
        sampleRows: projectSamples,
        iterationRows: projectIterations,
        pendingCount: projectSuggestions.filter((sugg) => sugg.status === "pending").length,
      }),
    );
  });

  const latestAccuracies = projectRows
    .map((row) => {
      const rows = iterationRows.filter((iter) => iter.projectId === row.id);
      const latest = [...rows].sort((a, b) => b.iteration - a.iteration)[0];
      return latest?.accuracy;
    })
    .filter((value): value is number => typeof value === "number");

  const weekAgo = Date.now() - 7 * 86_400_000;
  const summary: DashboardSummary = {
    totalProjects: projectRows.length,
    activeProjects: projectRows.filter((row) => row.status === "in_progress").length,
    completedProjects: projectRows.filter((row) => row.status === "completed").length,
    totalLabels: sampleRows.filter((row) => row.status === "labeled").length,
    totalScenes: sceneRows.length,
    totalIterations: iterationRows.length,
    meanAccuracy:
      latestAccuracies.length > 0
        ? round(
            latestAccuracies.reduce((acc, value) => acc + value, 0) / latestAccuracies.length,
            4,
          )
        : null,
    labeledThisWeek: sampleRows.filter((row) => new Date(row.createdAt).getTime() > weekAgo).length,
  };

  return { projects: serialized, summary };
}

export async function getProject(projectId: string): Promise<Project | null> {
  const context = await loadContext(projectId);
  return context ? withStats(context) : null;
}

export async function getDataset(projectId: string): Promise<DatasetResponse | null> {
  const context = await loadContext(projectId);
  if (!context) return null;
  const project = withStats(context);
  return {
    project,
    scenes: context.sceneRows.map((row) =>
      serializeScene(row, context.sampleRows.filter((sample) => sample.sceneId === row.id).length),
    ),
    samples: context.sampleRows.map(serializeSample),
    batches: context.batchRows.map(serializeBatch),
  };
}

export async function getPredictions(projectId: string): Promise<PredictionsResponse | null> {
  const context = await loadContext(projectId);
  if (!context) return null;
  const project = withStats(context);
  const pendingBatch =
    context.batchRows.find((row) => row.status === "pending") ?? context.batchRows[0] ?? null;
  const batchSuggestions = pendingBatch
    ? context.suggestionRows.filter((row) => row.batchId === pendingBatch.id)
    : [];
  const poolOffset = (hashString(context.project.name) % 320) + 480;
  const poolRemaining = Math.max(
    0,
    poolOffset + 1_800 - context.sampleRows.length - context.suggestionRows.length,
  );

  return {
    project,
    batch: pendingBatch ? serializeBatch(pendingBatch) : null,
    suggestions: batchSuggestions.map(serializeSuggestion),
    samples: context.sampleRows.map(serializeSample),
    scenes: context.sceneRows.map((row) => serializeScene(row)),
    poolRemaining,
  };
}

export async function getMetrics(projectId: string): Promise<MetricsResponse | null> {
  const context = await loadContext(projectId);
  if (!context) return null;
  const project = withStats(context);
  const iterationList = context.iterationRows
    .slice()
    .sort((a, b) => a.iteration - b.iteration)
    .map(serializeIteration);

  const labeled = context.sampleRows.filter((row) => row.status === "labeled");
  const pendingSuggestions = context.suggestionRows.filter((row) => row.status === "pending");

  const classDistribution = context.project.classes.map((cls) => ({
    classId: cls.id,
    name: cls.name,
    color: cls.color,
    count: labeled.filter((row) => row.classId === cls.id).length,
    suggested: pendingSuggestions.filter((row) => row.predictedClassId === cls.id).length,
  }));

  return {
    project,
    iterations: iterationList,
    latest: iterationList.length > 0 ? iterationList[iterationList.length - 1] : null,
    learningCurve: iterationList.map((row) => ({
      iteration: row.iteration,
      labeledSamples: row.labeledSamples,
      accuracy: row.accuracy,
      f1: row.f1,
      newLabels: row.newLabels,
    })),
    classDistribution,
    confidenceHistory: iterationList.map((row) => ({
      iteration: row.iteration,
      labeledSamples: row.labeledSamples,
      bins: row.confidenceHistogram,
      meanConfidence: meanConfidence(row.confidenceHistogram),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export async function createProject(input: {
  name: string;
  description: string;
  classNames: string[];
  aoiPreset?: string;
  aoiLabel?: string;
}): Promise<Project> {
  const classes: ClassDefinition[] = input.classNames.map((name, index) => ({
    id: slugifyClassId(name, index),
    name,
    color: colorForClass(index),
  }));

  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      description: input.description,
      numClasses: classes.length,
      classes,
      status: "unlabeled",
      aoi: aoiFromPreset(input.aoiPreset, input.aoiLabel),
    })
    .returning();

  return serializeProject(row, {
    sceneCount: 0,
    labeledSamples: 0,
    skippedSamples: 0,
    iterationCount: 0,
    accuracy: null,
    f1: null,
    kappa: null,
    confidence: null,
    pendingSuggestions: 0,
    lastTrainedAt: null,
  });
}

export async function recomputeProjectStatus(projectId: string): Promise<void> {
  const [labeledCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(samples)
    .where(and(eq(samples.projectId, projectId), eq(samples.status, "labeled")));

  const [latest] = await db
    .select()
    .from(iterations)
    .where(eq(iterations.projectId, projectId))
    .orderBy(desc(iterations.iteration))
    .limit(1);

  const status =
    latest && latest.accuracy >= 0.93
      ? "completed"
      : (labeledCount?.count ?? 0) > 0
        ? "in_progress"
        : "unlabeled";

  await db.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, projectId));
}
