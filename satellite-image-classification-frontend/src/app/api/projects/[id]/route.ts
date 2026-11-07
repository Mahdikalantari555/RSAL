import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getProject } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const project = await getProject(id);
    if (!project) return notFound();
    return Response.json({ project });
  } catch (error) {
    console.error("[GET /api/projects/:id]", error);
    return jsonError("Unable to load project", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const deleted = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    if (deleted.length === 0) return notFound();
    return Response.json({ ok: true, id });
  } catch (error) {
    console.error("[DELETE /api/projects/:id]", error);
    return jsonError("Unable to delete project", 500);
  }
}
