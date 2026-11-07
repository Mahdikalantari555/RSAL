"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Database,
  FolderPlus,
  Gauge,
  Layers,
  PencilRuler,
  Plus,
  Sparkles,
  Tag,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, InlineError, Progress, Skeleton } from "@/components/ui/feedback";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { useProjects } from "@/hooks/use-projects";
import { getErrorMessage } from "@/lib/api-client";
import { cn, formatNumber, formatPercent, formatRelativeTime } from "@/lib/utils";

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) points = [0.3, 0.45, 0.4, 0.6, 0.7];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 28 - ((value - min) / span) * 24;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className={cn("h-8 w-full", className)} preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  spark,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "primary" | "accent" | "info" | "warning";
  spark?: number[];
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "accent"
        ? "text-violet-400"
        : tone === "info"
          ? "text-sky-400"
          : "text-amber-400";
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</p>
          <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </p>
          <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
        </div>
        <span className={cn("grid size-8 place-items-center rounded-lg border border-line bg-surface-muted/60", toneClass)}>
          {icon}
        </span>
      </div>
      <div className={cn("mt-2 opacity-70", toneClass)}>
        <Sparkline points={spark ?? []} />
      </div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[128px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[352px] rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useProjects();
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("new=1")) {
      setCreateOpen(true);
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const projects = data?.projects ?? [];
  const reviewQueue = projects
    .filter((project) => project.stats.pendingSuggestions > 0)
    .sort((a, b) => b.stats.pendingSuggestions - a.stats.pendingSuggestions);
  const recentRounds = [...projects]
    .filter((project) => project.stats.lastTrainedAt)
    .sort(
      (a, b) =>
        new Date(b.stats.lastTrainedAt ?? 0).getTime() - new Date(a.stats.lastTrainedAt ?? 0).getTime(),
    )
    .slice(0, 4);
  const accuracySpark = projects
    .map((project) => project.stats.accuracy)
    .filter((value): value is number => typeof value === "number");
  const labelSpark = projects.map((project) => project.stats.labeledSamples);

  return (
    <AppShell
      breadcrumbs={[{ label: "Project dashboard" }]}
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)} className="ml-auto">
          <Plus className="size-4" />
          <span className="hidden sm:inline">New project</span>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">Project dashboard</h1>
              <Badge variant="primary" className="hidden sm:inline-flex">
                <Sparkles className="size-2.5" /> HITL
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              Every project is a human-in-the-loop loop: label a batch, retrain, review the most
              uncertain pixels. Below is the state of each loop.
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Inference worker online · queue drained
          </div>
        </div>

        {isError ? (
          <InlineError message={getErrorMessage(error)} onRetry={() => void refetch()} />
        ) : null}

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Active projects"
                value={formatNumber(data?.summary.totalProjects ?? 0)}
                hint={`${data?.summary.activeProjects ?? 0} in progress · ${data?.summary.completedProjects ?? 0} completed`}
                icon={<FolderPlus className="size-4" />}
                spark={labelSpark.length > 1 ? labelSpark : undefined}
              />
              <SummaryCard
                label="Human labels"
                value={formatNumber(data?.summary.totalLabels ?? 0)}
                hint={`${formatNumber(data?.summary.labeledThisWeek ?? 0)} added this week`}
                icon={<Tag className="size-4" />}
                tone="accent"
                spark={labelSpark.length > 1 ? labelSpark.map((value) => value * 0.8) : undefined}
              />
              <SummaryCard
                label="Mean accuracy"
                value={formatPercent(data?.summary.meanAccuracy ?? null)}
                hint={`across ${data?.summary.totalIterations ?? 0} training rounds`}
                icon={<Gauge className="size-4" />}
                tone="info"
                spark={accuracySpark.length > 1 ? accuracySpark : undefined}
              />
              <SummaryCard
                label="Scenes ingested"
                value={formatNumber(data?.summary.totalScenes ?? 0)}
                hint={`${formatNumber(data?.summary.totalIterations ?? 0)} model checkpoints`}
                icon={<Database className="size-4" />}
                tone="warning"
                spark={[0.3, 0.5, 0.45, 0.65, 0.6, 0.8, 0.85]}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_318px]">
              <div className="space-y-4">
                <SectionHeader
                  title="Projects"
                  description="Click a project to inspect its dataset, map and active-learning loop."
                  action={
                    <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="size-3.5" /> New project
                    </Button>
                  }
                />
                {projects.length === 0 ? (
                  <EmptyState
                    icon={<Layers className="size-5" />}
                    title="No projects yet"
                    description="Create your first project, upload a GeoTIFF scene and start labeling the most uncertain pixels."
                    action={
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="size-3.5" /> Create project
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {projects.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold">Review queue</p>
                      <p className="text-[10.5px] text-muted">Batches awaiting a human</p>
                    </div>
                    <Badge variant="primary">{reviewQueue.length}</Badge>
                  </div>
                  <div className="divide-y divide-line">
                    {reviewQueue.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[11.5px] text-muted">
                        No pending batches. Query a new batch from a project workspace.
                      </p>
                    ) : (
                      reviewQueue.slice(0, 4).map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}/active-learning`}
                          className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-muted/60"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary tabular-nums">
                            {project.stats.pendingSuggestions}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-medium">{project.name}</p>
                            <p className="text-[10px] text-muted">
                              Round {project.stats.iterationCount + 1} · {formatPercent(project.stats.accuracy)} acc
                            </p>
                          </div>
                          <ArrowRight className="size-3.5 shrink-0 text-muted" />
                        </Link>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold">Recent training rounds</p>
                      <p className="text-[10.5px] text-muted">Latest checkpoint per project</p>
                    </div>
                    <TrendingUp className="size-4 text-muted" />
                  </div>
                  <div className="space-y-3 px-4 py-3.5">
                    {recentRounds.length === 0 ? (
                      <p className="py-3 text-center text-[11.5px] text-muted">
                        No training rounds yet.
                      </p>
                    ) : (
                      recentRounds.map((project) => (
                        <div key={project.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11.5px]">
                            <span className="min-w-0 truncate font-medium">{project.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums text-primary">
                              {formatPercent(project.stats.accuracy)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted">
                            <span>
                              Round {project.stats.iterationCount} · {formatNumber(project.stats.labeledSamples)} labels
                            </span>
                            <span>{formatRelativeTime(project.stats.lastTrainedAt)}</span>
                          </div>
                          <Progress value={(project.stats.accuracy ?? 0) * 100} />
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                <Card className="p-4">
                  <p className="text-[13px] font-semibold">The loop</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">Four steps, repeated until target accuracy.</p>
                  <ol className="mt-3 space-y-2.5">
                    {[
                      { icon: <Database className="size-3.5" />, title: "Ingest GeoTIFF", copy: "Register bands, CRS and footprint" },
                      { icon: <PencilRuler className="size-3.5" />, title: "Label a seed batch", copy: "Draw points, boxes and polygons" },
                      { icon: <BarChart3 className="size-3.5" />, title: "Query hard pixels", copy: "Uncertainty-ranked suggestions" },
                      { icon: <CheckCircle2 className="size-3.5" />, title: "Retrain & ship", copy: "Accept, correct, retrain, repeat" },
                    ].map((step, index) => (
                      <li key={step.title} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface-muted/60 text-primary">
                          {step.icon}
                        </span>
                        <div>
                          <p className="text-[11.5px] font-medium leading-tight">
                            {index + 1}. {step.title}
                          </p>
                          <p className="text-[10px] text-muted">{step.copy}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Link href={projects[0] ? `/projects/${projects[0].id}/active-learning` : "#"}>
                    <Button variant="secondary" size="sm" className="mt-3 w-full">
                      Open active learning <ArrowUpRight className="size-3.5" />
                    </Button>
                  </Link>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  );
}
