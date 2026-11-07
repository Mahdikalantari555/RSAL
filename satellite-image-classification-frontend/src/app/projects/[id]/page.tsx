"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  Clock,
  Database,
  Image as ImageIcon,
  Layers,
  MapPin,
  PencilRuler,
  Radio,
  Settings2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Progress, Skeleton, StatusDot } from "@/components/ui/feedback";
import {
  ClassLegend,
  ConfusionMatrixCard,
  MetricsStrip,
} from "@/components/active-learning/metrics-overview";
import {
  ClassDistributionChart,
  LearningCurveChart,
} from "@/components/charts/metric-charts";
import { useDataset } from "@/hooks/use-dataset";
import { useMetrics } from "@/hooks/use-metrics";
import { formatBytes, formatDate, formatNumber, formatPercent, formatRelativeTime, statusLabel } from "@/lib/utils";

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const metricsQuery = useMetrics(projectId);
  const datasetQuery = useDataset(projectId);

  const metrics = metricsQuery.data;
  const dataset = datasetQuery.data;
  const project = metrics?.project ?? dataset?.project;
  const latest = metrics?.latest ?? null;

  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const counts = Object.fromEntries(
    (metrics?.classDistribution ?? []).map((entry) => [entry.classId, entry.count]),
  );
  const totalLabels = project.stats.labeledSamples;
  const target = 120;

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden">
        <div className="grid-backdrop absolute inset-0 opacity-70" />
        <div className="relative flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={project.status === "completed" ? "success" : project.status === "in_progress" ? "info" : "default"}
              >
                <StatusDot status={project.status} />
                {statusLabel(project.status)}
              </Badge>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                <MapPin className="size-3" /> {project.aoi.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                <Clock className="size-3" /> updated {formatRelativeTime(project.updatedAt)}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-[23px]">{project.name}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{project.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/projects/${projectId}/map`}>
              <Button variant="secondary" size="sm">
                <PencilRuler className="size-3.5" /> Open map
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/active-learning`}>
              <Button size="sm">
                <Sparkles className="size-3.5" />
                {project.stats.pendingSuggestions > 0
                  ? `Review ${project.stats.pendingSuggestions} suggestions`
                  : "Active learning loop"}
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <MetricsStrip
        iteration={latest}
        pendingSuggestions={project.stats.pendingSuggestions}
        isLoading={metricsQuery.isLoading}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Learning curve</p>
                <p className="text-[10.5px] text-muted">Accuracy & macro F1 against human labels</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="primary">{formatPercent(latest?.accuracy ?? null)} latest</Badge>
                <Badge variant="default">
                  target {formatPercent(0.93, 0)}
                </Badge>
              </div>
            </div>
            <div className="p-3">
              <LearningCurveChart points={metrics?.learningCurve ?? []} height={212} />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line px-4 py-3 sm:grid-cols-4">
              <div>
                <p className="text-[9.5px] uppercase tracking-wide text-muted">Rounds</p>
                <p className="text-sm font-semibold tabular-nums">{metrics?.iterations.length ?? 0}</p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-wide text-muted">Best F1</p>
                <p className="text-sm font-semibold tabular-nums text-primary">
                  {formatPercent(
                    metrics ? Math.max(...metrics.iterations.map((row) => row.f1), 0) : null,
                  )}
                </p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-wide text-muted">Mean confidence</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatPercent(project.stats.confidence)}
                </p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-wide text-muted">Last trained</p>
                <p className="text-sm font-semibold">{formatRelativeTime(project.stats.lastTrainedAt)}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <p className="text-[13px] font-semibold">Class distribution</p>
                <p className="text-[10.5px] text-muted">Human labels vs queued suggestions</p>
              </div>
              <div className="p-3">
                <ClassDistributionChart data={metrics?.classDistribution ?? []} height={216} />
              </div>
            </Card>

            <ConfusionMatrixCard iteration={latest} classes={project.classes} compact />
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Iteration history</p>
                <p className="text-[10.5px] text-muted">Every retrain is versioned with its metrics</p>
              </div>
              <Link href={`/projects/${projectId}/analytics`}>
                <Button variant="ghost" size="sm">
                  Analytics <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>
            {(metrics?.iterations.length ?? 0) === 0 ? (
              <div className="px-4 py-6">
                <EmptyState
                  icon={<Sparkles className="size-4" />}
                  title="No training rounds yet"
                  description="Label at least four samples, then retrain to create the first checkpoint."
                  className="border-0 bg-transparent py-4"
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[11.5px]">
                  <thead className="bg-surface-muted/40 text-[9.5px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Round</th>
                      <th className="px-3 py-2 font-semibold">Labels</th>
                      <th className="px-3 py-2 font-semibold">Accuracy</th>
                      <th className="px-3 py-2 font-semibold">F1</th>
                      <th className="px-3 py-2 font-semibold">Δ</th>
                      <th className="px-4 py-2 text-right font-semibold">Trained</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...metrics!.iterations].reverse().map((iteration, index, list) => {
                      const previous = list[index + 1];
                      const delta = previous ? iteration.accuracy - previous.accuracy : null;
                      return (
                        <tr key={iteration.id} className="transition hover:bg-surface-muted/40">
                          <td className="px-4 py-2 font-medium">R{iteration.iteration}</td>
                          <td className="px-3 py-2 tabular-nums text-muted">
                            {formatNumber(iteration.labeledSamples)}{" "}
                            <span className="text-[10px] text-primary">+{iteration.newLabels}</span>
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-primary">
                            {formatPercent(iteration.accuracy)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{iteration.f1.toFixed(3)}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {delta === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {delta >= 0 ? "+" : ""}
                                {(delta * 100).toFixed(1)}pp
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-[10.5px] text-muted">
                            {formatDate(iteration.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Dataset</p>
                <p className="text-[10.5px] text-muted">
                  {project.stats.sceneCount} scene{project.stats.sceneCount === 1 ? "" : "s"} registered
                </p>
              </div>
              <Link href={`/projects/${projectId}/data`}>
                <Button variant="ghost" size="icon-sm" aria-label="Manage dataset">
                  <Settings2 className="size-3.5" />
                </Button>
              </Link>
            </div>
            <div className="divide-y divide-line">
              {datasetQuery.isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : dataset && dataset.scenes.length > 0 ? (
                dataset.scenes.slice(0, 4).map((scene) => (
                  <div key={scene.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-muted/60 text-primary">
                      <ImageIcon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium">{scene.name}</p>
                      <p className="text-[10px] text-muted">
                        {scene.bandCount} bands · {scene.resolutionM}m · {formatBytes(scene.sizeBytes)}
                      </p>
                    </div>
                    <Badge variant="default">{scene.crs.replace("EPSG:", "E")}</Badge>
                  </div>
                ))
              ) : (
                <div className="px-4 py-5">
                  <EmptyState
                    icon={<Upload className="size-4" />}
                    title="No scenes yet"
                    description="Drop a GeoTIFF to register bands and footprint."
                    className="border-0 bg-transparent py-3"
                    action={
                      <Link href={`/projects/${projectId}/data`}>
                        <Button size="sm" variant="secondary">
                          <Upload className="size-3.5" /> Upload
                        </Button>
                      </Link>
                    }
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10.5px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Database className="size-3" /> {formatNumber(totalLabels)} labels
              </span>
              <Link href={`/projects/${projectId}/data`} className="text-primary hover:underline">
                Manage
              </Link>
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeader
              title="Label taxonomy"
              description={`${project.numClasses} classes · click to inspect`}
            />
            <div className="mt-2.5">
              <ClassLegend classes={project.classes} counts={counts} compact />
            </div>
            <div className="mt-3 space-y-1 border-t border-line pt-3">
              <div className="flex items-center justify-between text-[10.5px] text-muted">
                <span>Coverage of {target} label target</span>
                <span className="font-semibold text-foreground">
                  {formatNumber(totalLabels)}/{target}
                </span>
              </div>
              <Progress value={(totalLabels / target) * 100} />
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[13px] font-semibold">Loop configuration</p>
            <div className="mt-2 space-y-2 text-[11px]">
              {[
                { icon: <Radio className="size-3.5" />, label: "Sampling strategy", value: "Entropy + diversity" },
                { icon: <Layers className="size-3.5" />, label: "Backbone", value: "ResNet-34 U-Net" },
                { icon: <CircleDot className="size-3.5" />, label: "Patch size", value: "64 × 64 px" },
                { icon: <Sparkles className="size-3.5" />, label: "Batch size", value: "8 patches" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="text-primary">{row.icon}</span>
                    {row.label}
                  </span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            <Link href={`/projects/${projectId}/active-learning`}>
              <Button variant="secondary" size="sm" className="mt-3 w-full">
                Open the loop <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
