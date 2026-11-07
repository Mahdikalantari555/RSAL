"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Database, FileSpreadsheet, Info, Map as MapIcon, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { UploadDropzone } from "@/components/data/upload-dropzone";
import { DatasetSummary, DatasetTable } from "@/components/data/dataset-table";
import { LabelImporter } from "@/components/data/label-importer";
import { useDataset } from "@/hooks/use-dataset";
import { formatDate, formatNumber } from "@/lib/utils";

export default function DatasetPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const { data, isLoading } = useDataset(projectId);

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  const { project, scenes, samples, batches } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Dataset & uploads</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Register GeoTIFF scenes, inspect band metadata and import labels your team already
            collected. Every scene shares the project taxonomy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${projectId}/map`}>
            <Button variant="secondary" size="sm">
              <MapIcon className="size-3.5" /> Open map
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/active-learning`}>
            <Button size="sm">
              Active learning <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Upload satellite imagery</p>
                <p className="text-[10.5px] text-muted">
                  Metadata is read from GeoTIFF tags in the browser before ingest.
                </p>
              </div>
              <Badge variant="primary">
                <Upload className="size-2.5" /> GeoTIFF
              </Badge>
            </div>
            <div className="p-4">
              <UploadDropzone projectId={projectId} aoi={project.aoi} />
            </div>
          </Card>

          <DatasetTable scenes={scenes} />

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Active-learning batches</p>
                <p className="text-[10.5px] text-muted">Query history for this dataset</p>
              </div>
              <Badge variant="default">{batches.length}</Badge>
            </div>
            {batches.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Database className="size-4" />}
                  title="No query batches yet"
                  description="Run the active-learning loop to fetch uncertainty-ranked patches."
                  className="border-0 bg-transparent py-3"
                />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {batches.slice(0, 6).map((batch) => (
                  <div key={batch.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Badge variant={batch.status === "pending" ? "warning" : "success"}>
                      {batch.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium">
                        Round {batch.iteration} · {batch.size} suggestions
                      </p>
                      <p className="text-[10px] text-muted">
                        {formatDate(batch.createdAt)} · {batch.labeledCount}/{batch.size} reviewed
                      </p>
                    </div>
                    <Link
                      href={`/projects/${projectId}/active-learning`}
                      className="text-[10.5px] font-medium text-primary hover:underline"
                    >
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <DatasetSummary project={project} scenes={scenes} />

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="text-[13px] font-semibold">Import labeled samples</p>
              <p className="text-[10.5px] text-muted">Reuse existing field campaigns</p>
            </div>
            <div className="p-3">
              <LabelImporter projectId={projectId} classes={project.classes} />
            </div>
            <div className="space-y-1.5 border-t border-line px-4 py-3 text-[10px] leading-relaxed text-muted">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Info className="size-3 text-primary" /> Accepted formats
              </p>
              <p>GeoJSON: Point or Polygon features with a `class` property.</p>
              <p>CSV: `lat,lng,class` columns (x/y also supported).</p>
              <p>Shapefiles: convert to GeoJSON before importing.</p>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Recent labels</p>
                <p className="text-[10.5px] text-muted">Latest human annotations</p>
              </div>
              <FileSpreadsheet className="size-4 text-muted" />
            </div>
            <div className="divide-y divide-line">
              {samples.length === 0 ? (
                <p className="px-4 py-4 text-center text-[11px] text-muted">No labels yet.</p>
              ) : (
                samples.slice(0, 6).map((sample) => {
                  const cls = project.classes.find((item) => item.id === sample.classId);
                  return (
                    <div key={sample.id} className="flex items-center gap-2.5 px-4 py-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cls?.color ?? "#94A3B8" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">{cls?.name ?? sample.classId}</p>
                        <p className="truncate text-[9.5px] text-muted">
                          {sample.source} · {sample.geometry.type.toLowerCase()}
                        </p>
                      </div>
                      <span className="shrink-0 text-[9.5px] text-muted">
                        {formatDate(sample.createdAt).split(",")[0]}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-line px-4 py-2 text-center text-[10px] text-muted">
              {formatNumber(samples.length)} total ·{" "}
              <Link href={`/projects/${projectId}/map`} className="text-primary hover:underline">
                correct labels on map
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
