import { getMetrics } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const metrics = await getMetrics(id);
    if (!metrics) return notFound();
    return Response.json(metrics);
  } catch (error) {
    console.error("[GET /api/projects/:id/metrics]", error);
    return jsonError("Unable to load metrics", 500);
  }
}
