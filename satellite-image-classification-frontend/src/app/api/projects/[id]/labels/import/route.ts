import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, samples } from "@/db/schema";
import { recomputeProjectStatus, serializeSample } from "@/lib/server/data";
import { jsonError, notFound, parseJson } from "@/lib/server/http";
import { geometrySchema } from "../route";
import type { SampleGeometry } from "@/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const importSchema = z.object({
  fileName: z.string().optional(),
  samples: z
    .array(
      z.object({
        geometry: geometrySchema,
        classId: z.string(),
        note: z.string().max(600).nullish(),
        confidence: z.number().min(0).max(1).nullish(),
      }),
    )
    .min(1, "No valid samples found in the file")
    .max(5_000, "Import at most 5,000 samples at a time"),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = await parseJson(request, importSchema);
  if (parsed.response) return parsed.response;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();

    const byId = new Map(project.classes.map((cls) => [cls.id, cls.id]));
    const byName = new Map(project.classes.map((cls) => [cls.name.toLowerCase(), cls.id]));

    const rows: (typeof samples.$inferInsert)[] = [];
    let skipped = 0;

    for (const sample of parsed.data.samples) {
      const resolved =
        byId.get(sample.classId) ?? byName.get(sample.classId.trim().toLowerCase()) ?? null;
      if (!resolved) {
        skipped += 1;
        continue;
      }
      rows.push({
        projectId: id,
        geometry: sample.geometry as SampleGeometry,
        classId: resolved,
        source: "import",
        confidence: sample.confidence ?? null,
        note: sample.note?.trim() ? sample.note.trim() : null,
        status: "labeled",
        iteration: 0,
      });
    }

    const inserted =
      rows.length > 0
        ? await db.insert(samples).values(rows).returning()
        : [];

    await recomputeProjectStatus(id);

    return Response.json({
      inserted: inserted.length,
      skipped,
      samples: inserted.map(serializeSample),
    });
  } catch (error) {
    console.error("[POST /api/projects/:id/labels/import]", error);
    return jsonError("Unable to import labels", 500);
  }
}
