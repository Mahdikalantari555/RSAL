"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Command,
  LayoutDashboard,
  Menu,
  Plus,
  Radar,
  Search,
  X,
} from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useProjects } from "@/hooks/use-projects";
import { useUiStore } from "@/store/use-ui-store";
import { cn, statusLabel } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-[0_4px_16px_-6px_color-mix(in_srgb,var(--primary)_80%,transparent)]",
        className,
      )}
    >
      <Radar className="size-4.5" strokeWidth={2.2} />
      <span className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/25" />
    </span>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useProjects();
  const projects = data?.projects.slice(0, 6) ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">TerraLoop</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted">
            Active learning studio
          </p>
        </div>
      </div>

      <nav className="space-y-1 px-3 py-4">
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Workspace
        </p>
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
            pathname === "/"
              ? "bg-primary/10 text-primary"
              : "text-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <LayoutDashboard className="size-4" />
          Project dashboard
        </Link>
        <Link
          href="/?new=1"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted transition hover:bg-surface-muted hover:text-foreground"
        >
          <Plus className="size-4" />
          New project
        </Link>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Projects
          </p>
          <span className="text-[10px] text-muted">{data?.projects.length ?? 0}</span>
        </div>
        <div className="space-y-0.5">
          {projects.length === 0 ? (
            <div className="space-y-2 px-2 py-1">
              {[0, 1, 2].map((index) => (
                <div key={index} className="shimmer h-8 rounded-md" />
              ))}
            </div>
          ) : null}
          {projects.map((project) => {
            const active = pathname.startsWith(`/projects/${project.id}`);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] transition",
                  active
                    ? "bg-surface-muted text-foreground"
                    : "text-muted hover:bg-surface-muted/70 hover:text-foreground",
                )}
              >
                <StatusDot status={project.status} />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.stats.pendingSuggestions > 0 ? (
                  <span className="rounded bg-primary/15 px-1 py-0.5 text-[9.5px] font-bold text-primary">
                    {project.stats.pendingSuggestions}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-line p-3">
        <div className="flex items-center justify-between rounded-lg bg-surface-muted/60 px-2.5 py-2">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Activity className="size-3.5 text-primary" />
            Inference API
          </div>
          <Badge variant="success" className="normal-case tracking-normal">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            connected
          </Badge>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
          <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-[10px] font-bold text-white">
            AK
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-medium text-foreground">Aria Keller</p>
            <p className="truncate text-[10px] text-muted">Remote sensing lead</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  breadcrumbs,
  actions,
  toolbar,
}: {
  children: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const pathname = usePathname();
  const { data } = useProjects();
  const current = data?.projects.find((project) => pathname.startsWith(`/projects/${project.id}`));

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] border-r border-line bg-surface lg:block">
        <SidebarContent />
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[268px] border-r border-line bg-surface shadow-2xl">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-muted hover:bg-surface-muted"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-5 lg:px-7">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-line p-1.5 text-muted lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>

            <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
              <Link href="/" className="hidden shrink-0 text-muted transition hover:text-foreground sm:block">
                Projects
              </Link>
              {(breadcrumbs ?? []).map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  <ChevronRight className="hidden size-3 shrink-0 text-muted/60 sm:block" />
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hidden max-w-[160px] shrink-0 truncate text-muted transition hover:text-foreground sm:block"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
              {current ? (
                <Badge
                  variant={current.status === "completed" ? "success" : "info"}
                  className="ml-1 hidden md:inline-flex"
                >
                  {statusLabel(current.status)}
                </Badge>
              ) : null}
            </nav>

            <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-muted md:flex">
              <Search className="size-3.5" />
              <span className="w-28 text-[11.5px]">Search scenes…</span>
              <span className="flex items-center gap-0.5 rounded border border-line px-1 py-0.5 text-[9.5px] font-semibold">
                <Command className="size-2.5" />K
              </span>
            </div>

            {actions}
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
          </div>
          {toolbar}
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-3 py-5 sm:px-5 lg:px-7 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
