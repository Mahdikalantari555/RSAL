import type { ZodType } from "zod";

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function notFound(message = "Project not found"): Response {
  return jsonError(message, 404);
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; response?: never } | { data?: never; response: Response }> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { response: jsonError("Request body must be valid JSON", 400) };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return { response: jsonError(detail, 422) };
  }
  return { data: parsed.data };
}
