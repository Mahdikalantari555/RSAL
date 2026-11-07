import { getPredictions } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const payload = await getPredictions(id);
    if (!payload) return notFound();
    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/projects/:id/predictions]", error);
    return jsonError("Unable to load model suggestions", 500);
  }
}
