import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { datasets, iterations, projects, samples } from '@/db/schema';
import { DEMO_DATASET, DEMO_ITERATIONS, DEMO_PROJECTS, DEMO_SAMPLES } from '@/lib/demo';
import type {
  ClassDefinition,
  CreateProjectInput,
  Dataset,
  Iteration,
  LabelInput,
  Metrics,
  Project,
  Sample,
} from '@/types';
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
let seedPromise: Promise<void> | null = null;
export async function ensureSeed() {
  if (!seedPromise)
    seedPromise = db
      .transaction(async (tx) => {
        const [seeded] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, 'sacramento'));
        if (seeded) return;
        await tx.insert(projects).values(DEMO_PROJECTS).onConflictDoNothing();
        await tx.insert(datasets).values(DEMO_DATASET).onConflictDoNothing();
        await tx.insert(samples).values(DEMO_SAMPLES).onConflictDoNothing();
        await tx.insert(iterations).values(DEMO_ITERATIONS).onConflictDoNothing();
      })
      .catch((e: unknown) => {
        seedPromise = null;
        throw e;
      });
  await seedPromise;
}
export async function getProjects(): Promise<Project[]> {
  await ensureSeed();
  return (await db.select().from(projects).orderBy(asc(projects.createdAt))) as Project[];
}
export async function getProject(id: string): Promise<Project> {
  await ensureSeed();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) throw new ApiError('This project could not be found.', 404);
  return project as Project;
}
export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100)
    throw new ApiError('Enter a project name between 1 and 100 characters.');
  if (typeof input.description !== 'string' || input.description.length > 2000)
    throw new ApiError('The description must be under 2,000 characters.');
  if (!Array.isArray(input.classes) || input.classes.length < 2 || input.classes.length > 12)
    throw new ApiError('Add between 2 and 12 classes.');
  const classes: ClassDefinition[] = input.classes.map((c, i) => {
    if (
      typeof c.name !== 'string' ||
      !c.name.trim() ||
      c.name.length > 40 ||
      !/^#[0-9a-f]{6}$/i.test(c.color)
    )
      throw new ApiError('Every class needs a name and a valid color.');
    return { id: `class-${i + 1}`, name: c.name.trim(), color: c.color };
  });
  if (new Set(classes.map((c) => c.name.toLowerCase())).size !== classes.length)
    throw new ApiError('Class names must be unique.');
  const [project] = await db
    .insert(projects)
    .values({
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description.trim(),
      classes,
      demo: true,
    })
    .returning();
  return project as Project;
}
export async function getDatasets(id: string): Promise<Dataset[]> {
  await getProject(id);
  return (await db
    .select()
    .from(datasets)
    .where(eq(datasets.projectId, id))
    .orderBy(asc(datasets.createdAt))) as Dataset[];
}
export async function getSamples(id: string): Promise<Sample[]> {
  await getProject(id);
  return (await db
    .select()
    .from(samples)
    .where(eq(samples.projectId, id))
    .orderBy(asc(samples.batchIndex))) as Sample[];
}
export async function queryBatch(id: string, count = 12, strategy = 'entropy') {
  const project = await getProject(id);
  if (!Number.isInteger(count) || count < 1 || count > 48)
    throw new ApiError('Batch size must be between 1 and 48.');
  if (!['entropy', 'margin', 'least-confidence'].includes(strategy))
    throw new ApiError('Choose a supported query strategy.');
  const scenes = await getDatasets(id);
  const scene = scenes.find((d) => d.bounds);
  if (!scene?.bounds) throw new ApiError('Upload a georeferenced GeoTIFF before querying samples.');
  return db.transaction(async (tx) => {
    await tx.select().from(projects).where(eq(projects.id, id)).for('update');
    const pending = await tx
      .select()
      .from(samples)
      .where(and(eq(samples.projectId, id), eq(samples.status, 'pending')));
    if (pending.length) return { samples: pending as Sample[], existing: true };
    const [west, south, east, north] = scene.bounds!;
    const batch: Sample[] = Array.from({ length: count }, (_, i) => {
      const x = 0.12 + Math.random() * 0.76,
        y = 0.12 + Math.random() * 0.76;
      const confidence = 0.45 + Math.random() * 0.35;
      return {
        id: `sample-${randomUUID()}`,
        projectId: id,
        lat: south + y * (north - south),
        lng: west + x * (east - west),
        prediction: project.classes[i % project.classes.length].id,
        confidence,
        uncertainty: 1 - confidence * 0.5,
        status: 'pending',
        label: null,
        note: '',
        iteration: project.iteration,
        batchIndex: i,
        geometry: null,
        source: 'query',
      };
    });
    await tx.insert(samples).values(batch);
    return { samples: batch, existing: false };
  });
}
export async function saveLabels(id: string, input: LabelInput[]) {
  const project = await getProject(id);
  if (!Array.isArray(input) || !input.length || input.length > 1000)
    throw new ApiError('Submit between 1 and 1,000 labels.');
  if (new Set(input.map((x) => x.sampleId)).size !== input.length)
    throw new ApiError('The batch contains duplicate sample IDs.');
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
    let delta = 0;
    for (const item of input) {
      if (
        typeof item.sampleId !== 'string' ||
        item.sampleId.length > 150 ||
        !['labeled', 'skipped'].includes(item.status)
      )
        throw new ApiError('Invalid label submission.');
      if (item.status === 'labeled' && !project.classes.some((c) => c.id === item.label))
        throw new ApiError('Choose one of this project’s classes.');
      if (typeof item.note !== 'string' || item.note.length > 1000)
        throw new ApiError('Notes must be under 1,000 characters.');
      const [existing] = await tx.select().from(samples).where(eq(samples.id, item.sampleId));
      if (existing && existing.projectId !== id)
        throw new ApiError('This sample belongs to a different project.');
      if (existing) {
        if (existing.status !== 'labeled' && item.status === 'labeled') delta++;
        if (existing.status === 'labeled' && item.status !== 'labeled') delta--;
        await tx
          .update(samples)
          .set({
            label: item.status === 'labeled' ? item.label : null,
            status: item.status,
            note: item.note,
            iteration: locked.iteration,
          })
          .where(eq(samples.id, item.sampleId));
      } else {
        if (
          !Number.isFinite(item.lat) ||
          !Number.isFinite(item.lng) ||
          Math.abs(item.lat!) > 90 ||
          Math.abs(item.lng!) > 180
        )
          throw new ApiError('New samples need valid latitude and longitude coordinates.');
        if (item.geometry && !['Point', 'Polygon'].includes(item.geometry.type))
          throw new ApiError('Only point and polygon geometries are supported.');
        await tx.insert(samples).values({
          id: item.sampleId,
          projectId: id,
          lat: item.lat!,
          lng: item.lng!,
          prediction: item.label ?? project.classes[0].id,
          confidence: 1,
          uncertainty: 0,
          status: item.status,
          label: item.label,
          note: item.note,
          iteration: locked.iteration,
          batchIndex: 1000,
          source: 'manual',
          geometry: item.geometry ?? null,
        });
        if (item.status === 'labeled') delta++;
      }
    }
    await tx
      .update(projects)
      .set({
        labeledCount: Math.max(0, locked.labeledCount + delta),
        totalSamples: Math.max(locked.totalSamples, locked.labeledCount + delta),
        status: 'in_progress',
      })
      .where(eq(projects.id, id));
  });
  return { saved: input.length };
}
export async function trainModel(id: string) {
  await getProject(id);
  // This local model is an explicit demo. A configured upstream performs real ML training.
  await new Promise((resolve) => setTimeout(resolve, 1800));
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
    if (!project) throw new ApiError('This project was removed before training could finish.', 404);
    const reviewed = await tx
      .select()
      .from(samples)
      .where(
        and(
          eq(samples.projectId, id),
          eq(samples.iteration, project.iteration),
          eq(samples.status, 'labeled'),
        ),
      );
    if (!reviewed.length)
      throw new ApiError('Label at least one sample in this iteration before training.');
    const accuracy = Math.min(
      0.986,
      project.accuracy === 0
        ? 0.64 + Math.min(0.15, reviewed.length * 0.005)
        : project.accuracy + Math.min(0.024, reviewed.length * 0.0012),
    );
    const f1 = Math.max(0, accuracy - 0.01);
    const [iteration] = await tx
      .insert(iterations)
      .values({
        id: randomUUID(),
        projectId: id,
        number: project.iteration,
        accuracy,
        f1,
        sampleCount: reviewed.length,
        labeledCount: project.labeledCount,
      })
      .returning();
    await tx
      .update(projects)
      .set({
        accuracy,
        f1,
        iteration: project.iteration + 1,
        modelVersion: `Random Forest v0.${project.iteration + 1}`,
        status: project.labeledCount >= project.totalSamples ? 'completed' : 'in_progress',
      })
      .where(eq(projects.id, id));
    return { iteration: iteration as Iteration, demo: true };
  });
}
export async function getMetrics(id: string): Promise<Metrics> {
  const p = await getProject(id);
  const allSamples = await getSamples(id);
  const curve = await db
    .select()
    .from(iterations)
    .where(eq(iterations.projectId, id))
    .orderBy(asc(iterations.number));
  const realCounts = p.classes.map(
    (c) => allSamples.filter((s) => s.status === 'labeled' && s.label === c.id).length,
  );
  const base = Math.max(0, p.labeledCount - realCounts.reduce((a, b) => a + b, 0));
  const weights = p.classes.map((_, i) => [0.32, 0.18, 0.14, 0.28, 0.08][i % 5]);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const distribution = p.classes.map((c, i) => ({
    name: c.name,
    color: c.color,
    value: realCounts[i] + Math.floor((base * weights[i]) / totalWeight),
  }));
  if (distribution.length)
    distribution[0].value += p.labeledCount - distribution.reduce((a, b) => a + b.value, 0);
  const confusionMatrix = p.classes.map((_, i) =>
    p.classes.map((_, j) =>
      i === j
        ? Math.round(distribution[i].value * p.accuracy)
        : Math.round(
            (distribution[i].value * (1 - p.accuracy)) / Math.max(1, p.classes.length - 1),
          ),
    ),
  );
  return {
    accuracy: p.accuracy,
    f1: p.f1,
    labeledCount: p.labeledCount,
    totalSamples: p.totalSamples,
    iteration: p.iteration,
    curve: curve as Iteration[],
    distribution,
    confusionMatrix,
    confidenceDistribution: [
      { range: '0–20%', previous: 20, current: 8 },
      { range: '20–40%', previous: 57, current: 25 },
      { range: '40–60%', previous: 105, current: 72 },
      { range: '60–80%', previous: 290, current: 224 },
      { range: '80–100%', previous: 430, current: 573 },
    ],
    demo: true,
  };
}
