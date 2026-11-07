"use client";

import * as React from "react";
import { Activity, Crosshair, Gauge, Layers3, Target, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, Skeleton } from "@/components/ui/feedback";
import { cn, formatNumber, formatPercent, formatRelativeTime } from "@/lib/utils";
import type { ClassDefinition, IterationMetrics } from "@/types";

export function MetricTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "accent" | "warning";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
        <span
          className={cn(
            "text-muted",
            tone === "primary" && "text-primary",
            tone === "accent" && "text-violet-400",
            tone === "warning" && "text-amber-400",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-1 text-[18px] font-semibold leading-none tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function MetricsStrip({
  iteration,
  pendingSuggestions,
  isLoading,
}: {
  iteration: IterationMetrics | null;
  pendingSuggestions: number;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-[74px] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <MetricTile
        label="Accuracy"
        value={formatPercent(iteration?.accuracy ?? null)}
        hint={iteration ? `round ${iteration.iteration}` : "not trained"}
        icon={<Gauge className="size-3.5" />}
        tone="primary"
      />
      <MetricTile
        label="Macro F1"
        value={iteration ? iteration.f1.toFixed(3) : "—"}
        hint={`κ ${iteration ? iteration.kappa.toFixed(2) : "—"}`}
        icon={<Target className="size-3.5" />}
      />
      <MetricTile
        label="Precision"
        value={formatPercent(iteration?.precision ?? null)}
        hint={`recall ${formatPercent(iteration?.recall ?? null)}`}
        icon={<Crosshair className="size-3.5" />}
        tone="accent"
      />
      <MetricTile
        label="Labeled"
        value={formatNumber(iteration?.labeledSamples ?? 0)}
        hint={`+${formatNumber(iteration?.newLabels ?? 0)} last round`}
        icon={<Layers3 className="size-3.5" />}
      />
      <MetricTile
        label="In queue"
        value={formatNumber(pendingSuggestions)}
        hint="unreviewed patches"
        icon={<Activity className="size-3.5" />}
        tone="warning"
      />
      <MetricTile
        label="Train time"
        value={iteration ? `${iteration.trainSeconds.toFixed(1)}s` : "—"}
        hint={formatRelativeTime(iteration?.createdAt)}
        icon={<Timer className="size-3.5" />}
      />
    </div>
  );
}

export function ConfusionMatrixCard({
  iteration,
  classes,
  compact = false,
}: {
  iteration: IterationMetrics | null;
  classes: ClassDefinition[];
  compact?: boolean;
}) {
  if (!iteration) {
    return (
      <Card className="grid min-h-48 place-items-center p-5 text-center text-[11.5px] text-muted">
        Confusion matrix available after the first training round.
      </Card>
    );
  }

  const { matrix } = iteration.confusionMatrix;
  const nameFor = (classId: string) =>
    classes.find((cls) => cls.id === classId)?.name ?? classId.slice(0, 8);
  const colorFor = (classId: string) =>
    classes.find((cls) => cls.id === classId)?.color ?? "var(--muted-foreground)";
  const maxCell = Math.max(...matrix.flat(), 1);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold">Confusion matrix</p>
          <p className="text-[10.5px] text-muted">
            Round {iteration.iteration} · {formatNumber(iteration.labeledSamples)} labels
          </p>
        </div>
        <Badge variant="primary">κ {iteration.kappa.toFixed(3)}</Badge>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-[10px]">
          <thead>
            <tr>
              <th className="w-24" />
              {classes.map((cls) => (
                <th key={cls.id} className="px-1 pb-1 text-center font-medium text-muted">
                  <span className="mx-auto block max-w-[64px] truncate" title={cls.name}>
                    {cls.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((rowClass, rowIndex) => (
              <tr key={rowClass.id}>
                <th className="max-w-[96px] truncate pr-1 text-right text-[9.5px] font-medium text-muted" title={rowClass.name}>
                  <span className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: rowClass.color }} />
                  {rowClass.name}
                </th>
                {classes.map((colClass, colIndex) => {
                  const value = matrix[rowIndex]?.[colIndex] ?? 0;
                  const isDiagonal = rowIndex === colIndex;
                  const intensity = value / maxCell;
                  return (
                    <td key={colClass.id} className="p-0">
                      <div
                        className={cn(
                          "grid place-items-center rounded-[3px] text-[9.5px] font-medium tabular-nums",
                          compact ? "h-6" : "h-7",
                          isDiagonal ? "text-emerald-950 dark:text-emerald-50" : "text-foreground",
                        )}
                        style={{
                          backgroundColor: isDiagonal
                            ? `color-mix(in srgb, var(--primary) ${Math.round(20 + intensity * 65)}%, transparent)`
                            : `color-mix(in srgb, var(--danger) ${Math.round(intensity * 55)}%, var(--surface-muted))`,
                        }}
                        title={`${nameFor(rowClass.id)} → ${nameFor(colClass.id)}: ${value}`}
                      >
                        {value || ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[9.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--primary)" }} /> correct
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: "var(--danger)" }} /> misclassified
        </span>
        <span className="ml-auto">rows = ground truth · cols = prediction</span>
      </div>
    </Card>
  );
}

export function ClassLegend({
  classes,
  counts,
  activeClassId,
  onSelect,
  compact = false,
}: {
  classes: ClassDefinition[];
  counts?: Record<string, number>;
  activeClassId?: string | null;
  onSelect?: (classId: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-1.5", compact ? "grid-cols-2" : "sm:grid-cols-2")}>
      {classes.map((cls) => {
        const active = activeClassId === cls.id;
        return (
          <button
            key={cls.id}
            type="button"
            onClick={() => onSelect?.(cls.id)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition",
              active
                ? "border-primary/50 bg-primary/8"
                : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted/60",
              !onSelect && "cursor-default",
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full ring-2 ring-inset ring-white/10" style={{ backgroundColor: cls.color }} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{cls.name}</span>
            {counts ? (
              <span className="shrink-0 text-[10px] tabular-nums text-muted">{counts[cls.id] ?? 0}</span>
            ) : null}
            {active ? <span className="text-[9px] font-semibold text-primary">ACTIVE</span> : null}
          </button>
        );
      })}
    </div>
  );
}
