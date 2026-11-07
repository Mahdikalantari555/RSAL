"use client";

import * as React from "react";
import { ChevronDown, Database, Image as ImageIcon, Layers, MapPin } from "lucide-react";
import { Badge, EmptyState, Progress, Skeleton } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { cn, formatBytes, formatDate, formatNumber, formatPercent } from "@/lib/utils";
import type { DataScene, Project } from "@/types";

export function DatasetSummary({ project, scenes }: { project: Project; scenes: DataScene[] }) {
  const totalBytes = scenes.reduce((acc, scene) => acc + scene.sizeBytes, 0);
  const totalBands = scenes.reduce((acc, scene) => acc + scene.bandCount, 0);
  const resolutions = Array.from(new Set(scenes.map((scene) => `${scene.resolutionM}m`))).slice(0, 3);
  const crsValues = Array.from(new Set(scenes.map((scene) => scene.crs))).slice(0, 3);

  return (
    <Card className="divide-y divide-line">
      <div className="px-4 py-3">
        <p className="text-[13px] font-semibold">Dataset summary</p>
        <p className="text-[10.5px] text-muted">Registered rasters for this project</p>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        {[
          { label: "Scenes", value: formatNumber(scenes.length), icon: <ImageIcon className="size-3.5" /> },
          { label: "Labels", value: formatNumber(project.stats.labeledSamples), icon: <Database className="size-3.5" /> },
          { label: "Bands", value: formatNumber(totalBands), icon: <Layers className="size-3.5" /> },
          { label: "Footprint size", value: formatBytes(totalBytes), icon: <MapPin className="size-3.5" /> },
        ].map((item) => (
          <div key={item.label}>
            <p className="flex items-center gap-1 text-[9.5px] uppercase tracking-wide text-muted">
              <span className="text-primary">{item.icon}</span>
              {item.label}
            </p>
            <p className="mt-0.5 text-[14px] font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2 px-4 py-3 text-[10.5px]">
        <div className="flex items-center justify-between">
          <span className="text-muted">Resolutions</span>
          <span className="font-medium">{resolutions.join(" · ") || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Projections</span>
          <span className="font-medium">{crsValues.join(" · ") || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Classes</span>
          <span className="font-medium">{project.numClasses}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Mean label confidence</span>
          <span className="font-medium text-primary">{formatPercent(project.stats.confidence)}</span>
        </div>
      </div>
      <div className="space-y-1.5 px-4 py-3">
        <div className="flex items-center justify-between text-[10.5px] text-muted">
          <span>Target coverage</span>
          <span className="font-medium text-foreground">{project.stats.labeledSamples}/120 labels</span>
        </div>
        <Progress value={(project.stats.labeledSamples / 120) * 100} />
      </div>
    </Card>
  );
}

export function DatasetTable({
  scenes,
  isLoading,
}: {
  scenes: DataScene[];
  isLoading?: boolean;
}) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <Card className="space-y-2 p-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </Card>
    );
  }

  if (scenes.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon className="size-5" />}
        title="No GeoTIFF scenes registered"
        description="Drag a Sentinel-2, Landsat or PlanetScope GeoTIFF into the uploader above to create the first scene."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold">Scenes</p>
          <p className="text-[10.5px] text-muted">Click a row to inspect bands and footprint</p>
        </div>
        <Badge variant="default">{scenes.length} registered</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[11.5px]">
          <thead className="bg-surface-muted/40 text-[9.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Scene</th>
              <th className="px-3 py-2 font-semibold">Bands</th>
              <th className="px-3 py-2 font-semibold">Resolution</th>
              <th className="px-3 py-2 font-semibold">CRS</th>
              <th className="px-3 py-2 font-semibold">Samples</th>
              <th className="px-4 py-2 text-right font-semibold">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {scenes.map((scene) => {
              const open = expanded === scene.id;
              return (
                <React.Fragment key={scene.id}>
                  <tr
                    className={cn(
                      "cursor-pointer transition hover:bg-surface-muted/40",
                      open && "bg-surface-muted/50",
                    )}
                    onClick={() => setExpanded(open ? null : scene.id)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={cn("size-3.5 shrink-0 text-muted transition", open && "rotate-180")}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{scene.name}</p>
                          <p className="truncate text-[10px] text-muted">{scene.fileName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{scene.bandCount}</td>
                    <td className="px-3 py-2.5 tabular-nums">{scene.resolutionM}m</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="default">{scene.crs}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{scene.sampleCount}</td>
                    <td className="px-4 py-2.5 text-right text-[10.5px] text-muted">
                      {formatDate(scene.createdAt)}
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-surface-muted/25">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-muted">
                              Raster metadata
                            </p>
                            {[
                              ["Shape", `${scene.width} × ${scene.height} px`],
                              ["Band count", `${scene.bandCount} bands`],
                              ["Pixel size", `${scene.resolutionM} m`],
                              ["File size", formatBytes(scene.sizeBytes)],
                              ["Status", scene.status],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-3 text-[10.5px]">
                                <span className="text-muted">{label}</span>
                                <span className="font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-muted">
                              Bands & footprint
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {scene.bands.map((band) => (
                                <span
                                  key={band}
                                  className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                                >
                                  {band}
                                </span>
                              ))}
                            </div>
                            <p className="pt-1 font-mono text-[10px] leading-relaxed text-muted">
                              N {scene.bounds.north.toFixed(4)} · S {scene.bounds.south.toFixed(4)}
                              <br />
                              W {scene.bounds.west.toFixed(4)} · E {scene.bounds.east.toFixed(4)}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
