import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { batches, projects, samples, suggestions } from "@/db/schema";
import { recomputeProjectStatus, serializeSample } from "@/lib/server/data";
import { jsonError, notFound, parseJson } from "@/lib/server/http";
import type { SampleGeometry } from "@/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const geometrySchema = z.union([
  z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  }),
]);

const payloadSchema = z.object({
  batchId: z.string().uuid().nullish(),
  labels: z
    .array(
      z.object({
        suggestionId: z.string().uuid(),
        status: z.enum(["accepted", "overridden", "skipped"]),
        classId: z.string().nullish(),
        note: z.string().max(600).nullish(),
      }),
    )
    .optional()
    .default([]),
  samples: z
    .array(
      z.object({
        geometry: geometrySchema,
        classId: z.string(),
        sceneId: z.string().uuid().nullish(),
        note: z.string().max(600).nullish(),
        confidence: z.number().min(0).max(1).nullish(),
        source: z.enum(["human", "model", "import", "seed"]).optional(),
        status: z.enum(["labeled", "skipped"]).optional(),
      }),
    )
    .optional()
    .default([]),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = await parseJson(request, payloadSchema);
  if (parsed.response) return parsed.response;
  const payload = parsed.data;

  if (payload.labels.length === 0 && payload.samples.length === 0) {
    return jsonError("Nothing to submit — provide labels or samples", 422);
  }

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();
    const classIds = new Set(project.classes.map((cls) => cls.id));

    const rows: (typeof samples.$inferInsert)[] = [];
    let batchId = payload.batchId ?? null;

    const suggestionIds = payload.labels.map((label) => label.suggestionId);
    const suggestionRows =
      suggestionIds.length > 0
        ? await db
            .select()
            .from(suggestions)
            .where(and(eq(suggestions.projectId, id), inArray(suggestions.id, suggestionIds)))
        : [];

    for (const label of payload.labels) {
      const suggestion = suggestionRows.find((row) => row.id === label.suggestionId);
      if (!suggestion) continue;
      batchId = batchId ?? suggestion.batchId;
      const classId = label.classId ?? suggestion.predictedClassId;
      if (!classIds.has(classId)) {
        return jsonError(`Unknown class id: ${classId}`, 422);
      }
      const status = label.status === "skipped" ? "skipped" : "labeled";
      rows.push({
        projectId: id,
        geometry: {
          type: "Point",
          coordinates: [suggestion.lng, suggestion.lat],
        } satisfies SampleGeometry,
        classId,
        source: "human",
        confidence: suggestion.confidence,
        note: label.note?.trim() ? label.note.trim() : null,
        status,
        iteration: 0,
      });
      await db
        .update(suggestions)
        .set({
          status: label.status,
          note: label.note?.trim() ? label.note.trim() : null,
        })
        .where(eq(suggestions.id, suggestion.id));
    }

    for (const sample of payload.samples) {
      if (!classIds.has(sample.classId)) {
        return jsonError(`Unknown class id: ${sample.classId}`, 422);
      }
      rows.push({
        projectId: id,
        sceneId: sample.sceneId ?? null,
        geometry: sample.geometry as SampleGeometry,
        classId: sample.classId,
        source: sample.source ?? "human",
        confidence: sample.confidence ?? null,
        note: sample.note?.trim() ? sample.note.trim() : null,
        status: sample.status ?? "labeled",
        iteration: 0,
      });
    }

    const inserted =
      rows.length > 0 ? await db.insert(samples).values(rows).returning() : [];

    if (batchId) {
      const batchSuggestions = await db
        .select()
        .from(suggestions)
        .where(eq(suggestions.batchId, batchId));
      const labeledCount = batchSuggestions.filter((row) => row.status !== "pending").length;
      await db
        .update(batches)
        .set({
          labeledCount,
          status:
            batchSuggestions.length > 0 && labeledCount >= batchSuggestions.length
              ? "submitted"
              : "pending",
        })
        .where(eq(batches.id, batchId));
    }

    await recomputeProjectStatus(id);

    return Response.json({
      inserted: inserted.length,
      samples: inserted.map(serializeSample),
      batchId,
    });
  } catch (error) {
    console.error("[POST /api/projects/:id/labels]", error);
    return jsonError("Unable to submit labels", 500);
  }
}
