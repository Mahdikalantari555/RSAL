import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { iterations, projects, samples } from "@/db/schema";
import { recomputeProjectStatus, serializeIteration } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";
import { simulateMetrics } from "@/lib/simulation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const trainSchema = z.object({
  newLabels: z.number().int().min(0).optional(),
  epochs: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = trainSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid training payload", 422);

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(samples)
      .where(and(eq(samples.projectId, id), eq(samples.status, "labeled")));
    const labeledCount = countRow?.count ?? 0;

    if (labeledCount < 4) {
      return jsonError("Label at least 4 samples before training the model", 422);
    }

    const [latest] = await db
      .select()
      .from(iterations)
      .where(eq(iterations.projectId, id))
      .orderBy(desc(iterations.iteration))
      .limit(1);

    const nextIteration = (latest?.iteration ?? 0) + 1;
    const metrics = simulateMetrics(project.classes, labeledCount, project.name, nextIteration);

    const [row] = await db
      .insert(iterations)
      .values({
        projectId: id,
        iteration: nextIteration,
        ...metrics,
        labeledSamples: labeledCount,
        newLabels:
          parsed.data.newLabels ??
          Math.max(0, labeledCount - (latest?.labeledSamples ?? 0)),
      })
      .returning();

    await recomputeProjectStatus(id);

    return Response.json(
      { iteration: serializeIteration(row), epochs: parsed.data.epochs ?? 24 },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/projects/:id/train]", error);
    return jsonError("Training run failed", 500);
  }
}
