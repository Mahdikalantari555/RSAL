"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Gauge, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Progress, Skeleton } from "@/components/ui/feedback";
import {
  ClassDistributionChart,
  ConfidenceHistogramChart,
  ConfidenceHistoryChart,
  LearningCurveChart,
} from "@/components/charts/metric-charts";
import { MetricTile } from "@/components/active-learning/metrics-overview";
import { useMetrics } from "@/hooks/use-metrics";
import { cn, formatDate, formatNumber, formatPercent } from "@/lib/utils";

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const { data, isLoading } = useMetrics(projectId);

  const exportCsv = React.useCallback(() => {
    if (!data) return;
    const header = [
      "iteration",
      "labeled_samples",
      "new_labels",
      "accuracy",
      "f1",
      "precision",
      "recall",
      "kappa",
      "train_seconds",
      "trained_at",
    ].join(",");
    const rows = data.iterations.map((iteration) =>
      [
        iteration.iteration,
        iteration.labeledSamples,
        iteration.newLabels,
        iteration.accuracy,
        iteration.f1,
        iteration.precision,
        iteration.recall,
        iteration.kappa,
        iteration.trainSeconds,
        iteration.createdAt,
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-history.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-[74px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  const { project, iterations, latest, learningCurve, classDistribution, confidenceHistory } = data;
  const bestAccuracy = iterations.length > 0 ? Math.max(...iterations.map((row) => row.accuracy)) : null;
  const bestF1 = iterations.length > 0 ? Math.max(...iterations.map((row) => row.f1)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold tracking-tight">Analytics & history</h1>
            <Badge variant="violet">
              <TrendingUp className="size-2.5" /> {iterations.length} rounds
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Learning curves, confidence drift and per-class errors across every active-learning
            iteration. Use this to justify stopping or to find weak classes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={iterations.length === 0}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Link href={`/projects/${projectId}/active-learning`}>
            <Button size="sm">
              <Sparkles className="size-3.5" /> Continue loop
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          label="Accuracy"
          value={formatPercent(latest?.accuracy ?? null)}
          hint={`best ${formatPercent(bestAccuracy)}`}
          icon={<Gauge className="size-3.5" />}
          tone="primary"
        />
        <MetricTile
          label="Macro F1"
          value={latest ? latest.f1.toFixed(3) : "—"}
          hint={`best ${bestF1 !== null ? bestF1.toFixed(3) : "—"}`}
        />
        <MetricTile
          label="Kappa"
          value={latest ? latest.kappa.toFixed(3) : "—"}
          hint="agreement vs chance"
        />
        <MetricTile
          label="Labels"
          value={formatNumber(project.stats.labeledSamples)}
          hint={`${formatNumber(project.stats.skippedSamples)} skipped`}
        />
        <MetricTile
          label="Mean confidence"
          value={formatPercent(
            confidenceHistory.length > 0
              ? confidenceHistory[confidenceHistory.length - 1].meanConfidence
              : null,
          )}
          hint="latest validation split"
        />
        <MetricTile
          label="Query queue"
          value={formatNumber(project.stats.pendingSuggestions)}
          hint="patches awaiting review"
          tone="warning"
        />
      </div>

      {iterations.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No training history yet"
          description="Label a handful of samples and run the first training round — the learning curve will appear here."
          action={
            <Link href={`/projects/${projectId}/map`}>
              <Button size="sm">Start labeling</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold">Learning curve</p>
                  <p className="text-[10.5px] text-muted">
                    Accuracy and macro F1 as human labels accumulate
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">+{formatNumber(iterations.reduce((acc, row) => acc + row.newLabels, 0))} labels</Badge>
                  <Badge variant="default">target {formatPercent(0.93, 0)}</Badge>
                </div>
              </div>
              <div className="p-3">
                <LearningCurveChart points={learningCurve} height={274} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <p className="text-[13px] font-semibold">Model confidence over time</p>
                <p className="text-[10.5px] text-muted">Mean softmax confidence per round</p>
              </div>
              <div className="p-3">
                <ConfidenceHistoryChart history={confidenceHistory} height={214} />
              </div>
              <div className="border-t border-line p-3">
                <p className="mb-1 text-[10.5px] font-medium text-muted">
                  Confidence distribution · latest round
                </p>
                <ConfidenceHistogramChart
                  bins={latest?.confidenceHistogram ?? []}
                  height={126}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold">Class distribution</p>
                  <p className="text-[10.5px] text-muted">Human labels per class (queued shown in grey)</p>
                </div>
                <Badge variant="default">{classDistribution.length} classes</Badge>
              </div>
              <div className="p-3">
                <ClassDistributionChart data={classDistribution} height={258} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold">Per-class performance</p>
                  <p className="text-[10.5px] text-muted">Latest validation split · F1 sorted</p>
                </div>
                <Badge variant="primary">round {latest?.iteration ?? 0}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[430px] text-left text-[11.5px]">
                  <thead className="bg-surface-muted/40 text-[9.5px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Class</th>
                      <th className="px-3 py-2 font-semibold">Precision</th>
                      <th className="px-3 py-2 font-semibold">Recall</th>
                      <th className="px-3 py-2 font-semibold">F1</th>
                      <th className="px-4 py-2 font-semibold">Support</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...(latest?.classMetrics ?? [])]
                      .sort((a, b) => b.f1 - a.f1)
                      .map((metric) => {
                        const cls = project.classes.find((item) => item.id === metric.classId);
                        return (
                          <tr key={metric.classId} className="hover:bg-surface-muted/40">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: cls?.color ?? "#94A3B8" }}
                                />
                                <span className="font-medium">{cls?.name ?? metric.classId}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted">
                              {formatPercent(metric.precision)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted">
                              {formatPercent(metric.recall)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="w-9 font-semibold tabular-nums">
                                  {metric.f1.toFixed(2)}
                                </span>
                                <Progress
                                  value={metric.f1 * 100}
                                  className="h-1 w-14"
                                  indicatorClassName={cn(
                                    metric.f1 >= 0.9
                                      ? "bg-primary"
                                      : metric.f1 >= 0.75
                                        ? "bg-amber-400"
                                        : "bg-rose-400",
                                  )}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2 tabular-nums text-muted">{metric.support}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Iteration log</p>
                <p className="text-[10.5px] text-muted">Full training history for this project</p>
              </div>
              <Button variant="ghost" size="sm" onClick={exportCsv}>
                <Download className="size-3.5" /> CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[11.5px]">
                <thead className="bg-surface-muted/40 text-[9.5px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Round</th>
                    <th className="px-3 py-2 font-semibold">Labels</th>
                    <th className="px-3 py-2 font-semibold">New</th>
                    <th className="px-3 py-2 font-semibold">Accuracy</th>
                    <th className="px-3 py-2 font-semibold">F1</th>
                    <th className="px-3 py-2 font-semibold">Kappa</th>
                    <th className="px-3 py-2 font-semibold">Train</th>
                    <th className="px-4 py-2 text-right font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...iterations].reverse().map((iteration, index, list) => {
                    const previous = list[index + 1];
                    const delta = previous ? iteration.accuracy - previous.accuracy : null;
                    return (
                      <tr key={iteration.id} className="hover:bg-surface-muted/40">
                        <td className="px-4 py-2 font-medium">R{iteration.iteration}</td>
                        <td className="px-3 py-2 tabular-nums">{formatNumber(iteration.labeledSamples)}</td>
                        <td className="px-3 py-2 tabular-nums text-primary">+{iteration.newLabels}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold tabular-nums">{formatPercent(iteration.accuracy)}</span>
                          {delta !== null ? (
                            <span
                              className={cn(
                                "ml-1.5 text-[10px]",
                                delta >= 0 ? "text-emerald-400" : "text-rose-400",
                              )}
                            >
                              {delta >= 0 ? "+" : ""}
                              {(delta * 100).toFixed(1)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted">{iteration.f1.toFixed(3)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">{iteration.kappa.toFixed(3)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted">
                          {iteration.trainSeconds.toFixed(1)}s
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
          </Card>
        </>
      )}
    </div>
  );
}
