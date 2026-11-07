"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/feedback";
import { useUploadScene } from "@/hooks/use-dataset";
import { getErrorMessage } from "@/lib/api-client";
import { buildUploadMetadata } from "@/lib/geotiff-metadata";
import { cn, formatBytes } from "@/lib/utils";
import type { AreaOfInterest, UploadMetadata } from "@/types";

type ItemStatus = "queued" | "parsing" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: ItemStatus;
  metadata?: UploadMetadata;
  source?: "geotiff" | "estimated";
  note?: string;
  error?: string;
}

export function UploadDropzone({ projectId, aoi }: { projectId: string; aoi: AreaOfInterest }) {
  const upload = useUploadScene(projectId);
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [busy, setBusy] = React.useState(false);

  const patchItem = React.useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const startUpload = React.useCallback(
    async (file: File, id: string) => {
      patchItem(id, { status: "parsing", progress: 2, error: undefined });
      try {
        const parsed = await buildUploadMetadata(file, aoi.bounds);
        patchItem(id, {
          metadata: parsed.metadata,
          source: parsed.source,
          note: parsed.note,
          status: "uploading",
          progress: 8,
        });
        await upload.mutateAsync({
          file,
          metadata: parsed.metadata,
          onProgress: (percent) => patchItem(id, { progress: Math.max(8, percent) }),
        });
        patchItem(id, { status: "done", progress: 100 });
        toast.success("Scene registered", {
          description: `${parsed.metadata.name} · ${parsed.metadata.bandCount} bands · ${parsed.metadata.crs}`,
        });
      } catch (error) {
        patchItem(id, { status: "error", error: getErrorMessage(error) });
        toast.error("Upload failed", { description: getErrorMessage(error) });
      }
    },
    [aoi.bounds, patchItem, upload],
  );

  const enqueue = React.useCallback(
    async (files: File[]) => {
      const accepted = files.slice(0, 10);
      const created = accepted.map<UploadItem>((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        progress: 0,
        status: "queued",
      }));
      setItems((prev) => [...created, ...prev]);
      setBusy(true);
      for (const item of created) {
        await startUpload(item.file, item.id);
      }
      setBusy(false);
    },
    [startUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => void enqueue(files),
    accept: { "image/tiff": [".tif", ".tiff"], "application/octet-stream": [".tif", ".tiff"] },
    multiple: true,
    maxSize: 2 * 1024 * 1024 * 1024,
    onDropRejected: (rejections) => {
      toast.error("Unsupported file", {
        description:
          rejections[0]?.errors[0]?.message ?? "Only .tif/.tiff GeoTIFF files up to 2GB are supported.",
      });
    },
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-8 text-center transition",
          isDragActive
            ? "border-primary bg-primary/8"
            : "border-line-strong bg-surface-muted/25 hover:border-primary/50 hover:bg-primary/[0.04]",
        )}
      >
        <input {...getInputProps()} />
        <span
          className={cn(
            "grid size-11 place-items-center rounded-xl border border-line bg-surface text-primary transition group-hover:scale-105",
            isDragActive && "scale-105 border-primary/40",
          )}
        >
          <CloudUpload className="size-5" />
        </span>
        <div>
          <p className="text-[13px] font-semibold">
            {isDragActive ? "Release to register scenes" : "Drop GeoTIFF scenes here"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            or <span className="font-medium text-primary">browse files</span> · multi-band .tif/.tiff ·
            up to 2GB each
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          <Badge variant="default">GeoTIFF</Badge>
          <Badge variant="default">Sentinel-2</Badge>
          <Badge variant="default">PlanetScope</Badge>
          <Badge variant="default">multi-band</Badge>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10.5px] text-muted">
            <span>
              Upload queue · {items.filter((item) => item.status === "done").length}/{items.length} complete
            </span>
            {!busy ? (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setItems([])}
              >
                Clear finished
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="size-3 animate-spin" /> processing…
              </span>
            )}
          </div>
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md border",
                    item.status === "done"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : item.status === "error"
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : "border-line bg-surface-muted/60 text-muted",
                  )}
                >
                  {item.status === "done" ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : item.status === "error" ? (
                    <AlertTriangle className="size-3.5" />
                  ) : item.status === "parsing" || item.status === "uploading" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium">{item.file.name}</p>
                  <p className="text-[10px] text-muted">
                    {formatBytes(item.file.size)}
                    {item.metadata
                      ? ` · ${item.metadata.bandCount} bands · ${item.metadata.width}×${item.metadata.height} · ${item.metadata.resolutionM}m · ${item.metadata.crs}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted">
                  {item.status === "done" ? "100%" : `${item.progress}%`}
                </span>
                {item.status === "error" ? (
                  <button
                    type="button"
                    aria-label="Retry upload"
                    onClick={() => void startUpload(item.file, item.id)}
                    className="rounded p-1 text-muted hover:text-foreground"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                ) : item.status === "done" ? (
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                    className="rounded p-1 text-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="mt-1.5">
                <Progress
                  value={item.progress}
                  indicatorClassName={item.status === "error" ? "bg-danger" : undefined}
                />
              </div>
              {item.status === "error" && item.error ? (
                <p className="mt-1.5 text-[10.5px] text-danger">{item.error}</p>
              ) : null}
              {item.status !== "error" && item.note ? (
                <p className="mt-1 text-[10px] text-muted">{item.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
