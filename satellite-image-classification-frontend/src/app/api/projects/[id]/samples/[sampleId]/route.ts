import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, samples } from "@/db/schema";
import { recomputeProjectStatus, serializeSample } from "@/lib/server/data";
import { jsonError, notFound, parseJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; sampleId: string }> };

const patchSchema = z.object({
  classId: z.string().optional(),
  note: z.string().max(600).nullish(),
  status: z.enum(["labeled", "skipped"]).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const { id, sampleId } = await context.params;
  const parsed = await parseJson(request, patchSchema);
  if (parsed.response) return parsed.response;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();

    if (parsed.data.classId) {
      const exists = project.classes.some((cls) => cls.id === parsed.data.classId);
      if (!exists) return jsonError(`Unknown class id: ${parsed.data.classId}`, 422);
    }

    const [updated] = await db
      .update(samples)
      .set({
        ...(parsed.data.classId ? { classId: parsed.data.classId } : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note ?? null } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      })
      .where(and(eq(samples.id, sampleId), eq(samples.projectId, id)))
      .returning();

    if (!updated) return notFound("Sample not found");
    await recomputeProjectStatus(id);
    return Response.json({ sample: serializeSample(updated) });
  } catch (error) {
    console.error("[PATCH /api/projects/:id/samples/:sampleId]", error);
    return jsonError("Unable to update sample", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, sampleId } = await context.params;
  try {
    const deleted = await db
      .delete(samples)
      .where(and(eq(samples.id, sampleId), eq(samples.projectId, id)))
      .returning({ id: samples.id });
    if (deleted.length === 0) return notFound("Sample not found");
    await recomputeProjectStatus(id);
    return Response.json({ ok: true, id: sampleId });
  } catch (error) {
    console.error("[DELETE /api/projects/:id/samples/:sampleId]", error);
    return jsonError("Unable to delete sample", 500);
  }
}
