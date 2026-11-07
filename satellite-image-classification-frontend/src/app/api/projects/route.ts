import { z } from "zod";
import { createProject, getDashboard } from "@/lib/server/data";
import { jsonError, parseJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name needs at least 2 characters").max(120),
  description: z.string().trim().max(600).optional().default(""),
  classes: z
    .array(z.string().trim().min(1).max(48))
    .min(2, "Define at least two classes")
    .max(12, "Maximum 12 classes supported"),
  aoiPreset: z.string().optional(),
  aoiLabel: z.string().optional(),
});

export async function GET() {
  try {
    const data = await getDashboard();
    return Response.json(data);
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return jsonError("Unable to load projects", 500);
  }
}

export async function POST(request: Request) {
  const parsed = await parseJson(request, createProjectSchema);
  if (parsed.response) return parsed.response;

  const uniqueClasses = Array.from(
    new Set(parsed.data.classes.map((value) => value.trim()).filter(Boolean)),
  );
  if (uniqueClasses.length < 2) {
    return jsonError("Class names must be unique — at least two distinct classes required", 422);
  }

  try {
    const project = await createProject({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      classNames: uniqueClasses,
      aoiPreset: parsed.data.aoiPreset,
      aoiLabel: parsed.data.aoiLabel,
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]", error);
    return jsonError("Unable to create project", 500);
  }
}
