import { getDataset } from "@/lib/server/data";
import { jsonError, notFound } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const dataset = await getDataset(id);
    if (!dataset) return notFound();
    return Response.json(dataset);
  } catch (error) {
    console.error("[GET /api/projects/:id/dataset]", error);
    return jsonError("Unable to load dataset", 500);
  }
}
