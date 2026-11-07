import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { serializeScene } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const boundsSchema = z.object({
  north: z.number(),
  south: z.number(),
  east: z.number(),
  west: z.number(),
});

const metadataSchema = z.object({
  name: z.string().trim().min(1, "Scene name is required"),
  fileName: z.string().trim().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  bandCount: z.number().int().min(1).max(64),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  crs: z.string().trim().min(1),
  resolutionM: z.number().positive(),
  bands: z.array(z.string()).max(64).optional().default([]),
  bounds: boundsSchema.optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) return notFound();

    let raw: unknown;
    let fileName: string | undefined;
    let sizeBytes = 0;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const metadataField = form.get("metadata");
      if (typeof metadataField !== "string") {
        return jsonError("Missing `metadata` field", 422);
      }
      try {
        raw = JSON.parse(metadataField);
      } catch {
        return jsonError("`metadata` must be valid JSON", 422);
      }
      if (file instanceof File) {
        fileName = file.name;
        sizeBytes = file.size;
      }
    } else {
      raw = await request.json();
    }

    const parsed = metadataSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return jsonError(detail, 422);
    }

    const metadata = parsed.data;
    const [row] = await db
      .insert(scenes)
      .values({
        projectId: project.id,
        name: metadata.name,
        fileName: metadata.fileName ?? fileName ?? `${metadata.name}.tif`,
        sizeBytes: metadata.sizeBytes ?? sizeBytes,
        bandCount: metadata.bandCount,
        width: metadata.width,
        height: metadata.height,
        crs: metadata.crs,
        resolutionM: metadata.resolutionM,
        bands: metadata.bands ?? [],
        bounds: metadata.bounds ?? project.aoi.bounds,
        status: "ready",
      })
      .returning();

    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));

    return Response.json({ scene: serializeScene(row, 0) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects/:id/upload]", error);
    return jsonError("Unable to register uploaded scene", 500);
  }
}
