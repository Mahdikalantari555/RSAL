"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import { FileJson, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge, Progress } from "@/components/ui/feedback";
import { useImportLabels } from "@/hooks/use-dataset";
import { getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ClassDefinition, ImportSample, SampleGeometry } from "@/types";

interface ParseResult {
  samples: ImportSample[];
  skipped: number;
  format: "geojson" | "csv";
}

function resolveClass(raw: unknown, classes: ClassDefinition[]): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw).trim().toLowerCase();
  const byId = classes.find((cls) => cls.id.toLowerCase() === value);
  if (byId) return byId.id;
  const byName = classes.find((cls) => cls.name.toLowerCase() === value);
  if (byName) return byName.id;
  return null;
}

function parseGeoJson(content: string, classes: ClassDefinition[]): ParseResult {
  const parsed = JSON.parse(content) as unknown;
  const features =
    parsed && typeof parsed === "object" && "features" in parsed
      ? ((parsed as { features: unknown[] }).features ?? [])
      : Array.isArray(parsed)
        ? parsed
        : [parsed];

  const samples: ImportSample[] = [];
  let skipped = 0;

  for (const feature of features) {
    const item = feature as {
      type?: string;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const geometry = item.geometry;
    const props = item.properties ?? {};
    const classId = resolveClass(
      props.classId ?? props.class ?? props.label ?? props.CLASS ?? props.LandCover,
      classes,
    );
    if (
      !geometry ||
      (geometry.type !== "Point" && geometry.type !== "Polygon") ||
      !Array.isArray(geometry.coordinates) ||
      !classId
    ) {
      skipped += 1;
      continue;
    }
    samples.push({
      geometry: { type: geometry.type, coordinates: geometry.coordinates } as SampleGeometry,
      classId,
      confidence: typeof props.confidence === "number" ? props.confidence : null,
      note: typeof props.note === "string" ? props.note : undefined,
    });
  }

  return { samples, skipped, format: "geojson" };
}

function parseCsv(content: string, classes: ClassDefinition[]): ParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { samples: [], skipped: 0, format: "csv" };
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const latIndex = headers.findIndex((header) => ["lat", "latitude", "y"].includes(header));
  const lngIndex = headers.findIndex((header) => ["lon", "lng", "long", "longitude", "x"].includes(header));
  const classIndex = headers.findIndex((header) =>
    ["class", "classid", "class_id", "label", "landcover", "land_cover"].includes(header),
  );

  if (latIndex === -1 || lngIndex === -1 || classIndex === -1) {
    throw new Error("CSV needs lat/lon (or x/y) and class columns");
  }

  const samples: ImportSample[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const lat = Number(cells[latIndex]);
    const lng = Number(cells[lngIndex]);
    const classId = resolveClass(cells[classIndex], classes);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !classId) {
      skipped += 1;
      continue;
    }
    samples.push({ geometry: { type: "Point", coordinates: [lng, lat] }, classId });
  }

  return { samples, skipped, format: "csv" };
}

export function LabelImporter({
  projectId,
  classes,
}: {
  projectId: string;
  classes: ClassDefinition[];
}) {
  const importLabels = useImportLabels(projectId);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ParseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setFileName(file.name);
      try {
        const content = await file.text();
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        const parsed = isCsv ? parseCsv(content, classes) : parseGeoJson(content, classes);
        if (parsed.samples.length === 0) {
          setError("No valid samples found. Check the class names and coordinate columns.");
          return;
        }
        setResult(parsed);
        const response = await importLabels.mutateAsync({ fileName: file.name, samples: parsed.samples });
        toast.success(`Imported ${response.inserted} labeled samples`, {
          description:
            response.skipped > 0
              ? `${response.skipped} rows skipped (unknown class or geometry).`
              : "All rows were assigned to project classes.",
        });
      } catch (caught) {
        const message = getErrorMessage(caught);
        setError(message);
        toast.error("Import failed", { description: message });
      }
    },
    [classes, importLabels],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      const file = files[0];
      if (file) void handleFile(file);
    },
    accept: {
      "application/geo+json": [".geojson"],
      "application/json": [".json", ".geojson"],
      "text/csv": [".csv"],
    },
    multiple: false,
    maxSize: 25 * 1024 * 1024,
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 transition",
          isDragActive
            ? "border-primary bg-primary/8"
            : "border-line-strong bg-surface-muted/30 hover:border-primary/40",
        )}
      >
        <input {...getInputProps()} />
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-primary">
          {importLabels.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium">
            {fileName ?? "Import existing labels"}
          </p>
          <p className="text-[10px] text-muted">
            GeoJSON or CSV with lat/lon + class columns
          </p>
        </div>
        <FileJson className="size-3.5 shrink-0 text-muted" />
      </div>

      {importLabels.isPending ? <Progress value={65} className="h-1" /> : null}

      {result ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface-muted/40 px-2 py-1.5 text-[10px] text-muted">
          <Badge variant="primary">{result.format}</Badge>
          <span>{result.samples.length} parsed</span>
          <span>·</span>
          <span>{result.skipped} skipped</span>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/8 px-2 py-1.5 text-[10.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
