import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { batches, iterations, projects, samples, suggestions } from "@/db/schema";
import {
  getPredictions,
  recomputeProjectStatus,
  serializeBatch,
  serializeSuggestion,
} from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";
import {
  mulberry32,
  hashString,
  randomInRange,
  randomPointInBounds,
  simulatePrediction,
} from "@/lib/simulation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const querySchema = z.object({
  size: z.number().int().min(1).max(32).optional().default(8),
  strategy: z.enum(["uncertainty", "diversity", "random"]).optional().default("uncertainty"),
  force: z.boolean().optional().default(false),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid query payload", 422);
  }
  const { size, force, strategy } = parsed.data;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();

    const [existingBatch] = await db
      .select()
      .from(batches)
      .where(and(eq(batches.projectId, id), eq(batches.status, "pending")))
      .limit(1);

    if (existingBatch && !force) {
      const payload = await getPredictions(id);
      if (!payload) return notFound();
      return Response.json({
        batch: payload.batch ?? serializeBatch(existingBatch),
        suggestions: payload.suggestions,
        poolRemaining: payload.poolRemaining,
        reused: true,
      });
    }

    if (existingBatch && force) {
      await db.delete(batches).where(eq(batches.id, existingBatch.id));
    }

    const existingSamples = await db.select().from(samples).where(eq(samples.projectId, id));
    const trainedRounds = await db
      .select({ iteration: iterations.iteration })
      .from(iterations)
      .where(eq(iterations.projectId, id));
    const queriedBatches = await db
      .select({ iteration: batches.iteration })
      .from(batches)
      .where(eq(batches.projectId, id));
    const nextIteration =
      Math.max(
        trainedRounds.reduce((acc, row) => Math.max(acc, row.iteration), 0),
        queriedBatches.reduce((acc, row) => Math.max(acc, row.iteration), 0),
      ) + 1;

    const rng = mulberry32(hashString(`${project.id}:${Date.now()}`));
    const classes = project.classes;
    const candidates = new Map<
      string,
      { lat: number; lng: number; predictedClassId: string; confidence: number; uncertainty: number }
    >();

    let attempts = 0;
    const target = Math.max(size, Math.ceil(size * 1.8));
    while (candidates.size < target && attempts < size * 40) {
      attempts += 1;
      const point = randomPointInBounds(project.aoi.bounds, rng, 0.06);
      const tooClose = existingSamples.some((sample) => {
        const geometry = sample.geometry;
        const coords =
          geometry.type === "Point"
            ? geometry.coordinates
            : geometry.coordinates[0]?.[0] ?? [0, 0];
        return Math.abs(coords[1] - point.lat) < 0.002 && Math.abs(coords[0] - point.lng) < 0.002;
      });
      if (tooClose) continue;
      const prediction = simulatePrediction(classes, rng, strategy === "uncertainty" ? 1.25 : 0.8);
      const uncertainty =
        strategy === "random"
          ? randomInRange(rng, 0.05, 0.98)
          : strategy === "diversity"
            ? prediction.uncertainty * randomInRange(rng, 0.85, 1.2)
            : prediction.uncertainty;
      candidates.set(`${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`, {
        lat: point.lat,
        lng: point.lng,
        predictedClassId: prediction.predictedClassId,
        confidence: prediction.confidence,
        uncertainty: Math.min(0.99, uncertainty),
      });
    }

    const ranked = Array.from(candidates.values())
      .sort((a, b) => b.uncertainty - a.uncertainty)
      .slice(0, size);

    const [batch] = await db
      .insert(batches)
      .values({
        projectId: id,
        iteration: nextIteration,
        size: ranked.length,
        labeledCount: 0,
        status: "pending",
      })
      .returning();

    const inserted = await db
      .insert(suggestions)
      .values(
        ranked.map((candidate) => ({
          projectId: id,
          batchId: batch.id,
          lat: candidate.lat,
          lng: candidate.lng,
          predictedClassId: candidate.predictedClassId,
          confidence: Number(candidate.confidence.toFixed(3)),
          uncertainty: Number(candidate.uncertainty.toFixed(3)),
          status: "pending" as const,
        })),
      )
      .returning();

    await recomputeProjectStatus(id);

    return Response.json(
      {
        batch: serializeBatch(batch),
        suggestions: inserted.map(serializeSuggestion),
        poolRemaining: Math.max(
          0,
          (hashString(project.name) % 320) +
            480 +
            1_800 -
            existingSamples.length -
            inserted.length,
        ),
        reused: false,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/projects/:id/query]", error);
    return jsonError("Unable to run active-learning query", 500);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const pending = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.projectId, id), inArray(suggestions.status, ["pending"])));
  return Response.json({ suggestions: pending.map(serializeSuggestion) });
}
