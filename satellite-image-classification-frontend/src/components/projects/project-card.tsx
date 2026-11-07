"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Image as ImageIcon,
  Layers,
  MoreHorizontal,
  PencilRuler,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Progress, StatusDot } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { useDeleteProject } from "@/hooks/use-projects";
import { satelliteTileUrl } from "@/lib/tiles";
import { cn, formatNumber, formatPercent, formatRelativeTime, statusLabel } from "@/lib/utils";
import type { Project } from "@/types";

export function ProjectCard({ project }: { project: Project }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [thumbOk, setThumbOk] = React.useState(true);
  const deleteProject = useDeleteProject();
  const [thumbUrl] = React.useState(() =>
    satelliteTileUrl(project.aoi.center[0], project.aoi.center[1], 12),
  );

  const coverage = Math.min(100, (project.stats.labeledSamples / 120) * 100);

  const handleDelete = async () => {
    if (!window.confirm(`Delete “${project.name}” and all of its labels?`)) return;
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success("Project deleted");
    } catch {
      toast.error("Could not delete project");
    }
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(2,6,23,0.5)]">
      <Link href={`/projects/${project.id}`} className="relative block h-28 overflow-hidden bg-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(61,220,151,0.35),transparent_55%),radial-gradient(circle_at_75%_80%,rgba(99,91,255,0.35),transparent_60%)]" />
        {thumbOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            className="absolute inset-0 size-full scale-105 object-cover opacity-80 transition duration-500 group-hover:scale-110 group-hover:opacity-95"
            onError={() => setThumbOk(false)}
            loading="lazy"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-slate-950/10" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <Badge
            variant={project.status === "completed" ? "success" : project.status === "in_progress" ? "info" : "default"}
            className="backdrop-blur"
          >
            <StatusDot status={project.status} />
            {statusLabel(project.status)}
          </Badge>
          <span className="rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 backdrop-blur">
            {project.aoi.label}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-1 text-[13.5px] font-semibold text-white drop-shadow">
            {project.name}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-300/90">
            {project.numClasses} classes · updated {formatRelativeTime(project.updatedAt)}
          </p>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted">
          {project.description || "No description yet."}
        </p>

        <div className="flex flex-wrap gap-1">
          {project.classes.slice(0, 6).map((cls) => (
            <span
              key={cls.id}
              className="inline-flex items-center gap-1 rounded border border-line bg-surface-muted/50 px-1.5 py-0.5 text-[10px] text-muted"
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: cls.color }} />
              {cls.name}
            </span>
          ))}
          {project.classes.length > 6 ? (
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
              +{project.classes.length - 6}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface-muted/40 px-2.5 py-2">
          <div>
            <p className="text-[9.5px] uppercase tracking-wide text-muted">Labels</p>
            <p className="text-[13px] font-semibold tabular-nums">{formatNumber(project.stats.labeledSamples)}</p>
          </div>
          <div>
            <p className="text-[9.5px] uppercase tracking-wide text-muted">Accuracy</p>
            <p
              className={cn(
                "text-[13px] font-semibold tabular-nums",
                project.stats.accuracy && project.stats.accuracy >= 0.9 ? "text-emerald-400" : "text-foreground",
              )}
            >
              {formatPercent(project.stats.accuracy)}
            </p>
          </div>
          <div>
            <p className="text-[9.5px] uppercase tracking-wide text-muted">Rounds</p>
            <p className="text-[13px] font-semibold tabular-nums">{project.stats.iterationCount}</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              {project.stats.sceneCount} scene{project.stats.sceneCount === 1 ? "" : "s"}
            </span>
            <span>{project.stats.pendingSuggestions} in review queue</span>
          </div>
          <Progress value={coverage} />
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <Link href={`/projects/${project.id}`} className="flex-1">
            <Button variant="secondary" size="sm" className="w-full">
              Open workspace
              <ArrowUpRight className="size-3.5" />
            </Button>
          </Link>
          <Link href={`/projects/${project.id}/active-learning`}>
            <Button variant="ghost" size="icon-sm" aria-label="Open active learning queue">
              <PencilRuler className="size-3.5" />
            </Button>
          </Link>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Project actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute bottom-8 right-0 z-20 w-40 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
                  <Link
                    href={`/projects/${project.id}/data`}
                    className="flex items-center gap-2 px-3 py-2 text-[11.5px] text-muted hover:bg-surface-muted hover:text-foreground"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ImageIcon className="size-3.5" /> Manage dataset
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleDelete();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11.5px] text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-3.5" /> Delete project
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
