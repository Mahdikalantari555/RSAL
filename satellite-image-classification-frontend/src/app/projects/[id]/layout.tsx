"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  BarChart3,
  Database,
  LayoutDashboard,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, InlineError, Skeleton } from "@/components/ui/feedback";
import { useProject } from "@/hooks/use-projects";
import { getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Overview", icon: LayoutDashboard },
  { segment: "data", label: "Dataset", icon: Database },
  { segment: "map", label: "Map viewer", icon: MapIcon },
  { segment: "active-learning", label: "Active learning", icon: Sparkles, queue: true },
  { segment: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const pathname = usePathname();
  const { data: project, isLoading, isError, error, refetch } = useProject(projectId);

  const base = `/projects/${projectId}`;

  const toolbar = (
    <div className="border-t border-line/70 bg-surface/40">
      <div className="flex items-center gap-1 overflow-x-auto px-2 sm:px-4 lg:px-6">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active =
            tab.segment === ""
              ? pathname === base
              : pathname.startsWith(`${base}/${tab.segment}`);
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-[12px] font-medium transition",
                active ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              <tab.icon className={cn("size-3.5", active && "text-primary")} />
              {tab.label}
              {"queue" in tab && tab.queue && (project?.stats.pendingSuggestions ?? 0) > 0 ? (
                <Badge variant="primary" className="ml-0.5 px-1 py-0 text-[9px]">
                  {project?.stats.pendingSuggestions}
                </Badge>
              ) : null}
              {active ? (
                <span className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
        <div className="ml-auto hidden shrink-0 items-center gap-3 py-1.5 pr-2 text-[10.5px] text-muted sm:flex">
          <span>
            <span className="font-semibold text-foreground">{project?.stats.sceneCount ?? 0}</span> scenes
          </span>
          <span className="h-3 w-px bg-line" />
          <span>
            <span className="font-semibold text-foreground">{project?.stats.labeledSamples ?? 0}</span> labels
          </span>
          <span className="h-3 w-px bg-line" />
          <span>round {project?.stats.iterationCount ?? 0}</span>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      breadcrumbs={[{ label: project?.name ?? "Project" }]}
      toolbar={toolbar}
    >
      {isError ? (
        <InlineError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : null}
      {isLoading || !project ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-[74px] rounded-lg" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
