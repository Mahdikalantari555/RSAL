"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, Layers, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Skeleton } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/form-controls";
import { MetricsStrip, ConfusionMatrixCard } from "@/components/active-learning/metrics-overview";
import { SuggestionPanel } from "@/components/active-learning/suggestion-panel";
import { TrainDialog } from "@/components/active-learning/train-dialog";
import { ClassDistributionChart } from "@/components/charts/metric-charts";
import { usePredictions, useQueryBatch } from "@/hooks/use-active-learning";
import { useMetrics } from "@/hooks/use-metrics";
import { getErrorMessage } from "@/lib/api-client";
import { BAND_PRESETS } from "@/lib/raster";
import { useMapStore } from "@/store/use-map-store";
import { useLabelingStore } from "@/store/use-labeling-store";

const MapCanvas = dynamic(() => import("@/components/map/map-canvas").then((mod) => mod.MapCanvas), {
  ssr: false,
  loading: () => <div className="shimmer h-[380px] w-full" />,
});

const BATCH_SIZES = [4, 8, 12, 16];

export default function ActiveLearningPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const predictionsQuery = usePredictions(projectId);
  const metricsQuery = useMetrics(projectId);
  const queryBatch = useQueryBatch(projectId);
  const resetLabeling = useLabelingStore((state) => state.reset);

  const { bandPreset, setBandPreset, opacity, selectedSuggestionId, selectSuggestion } = useMapStore();

  const [trainOpen, setTrainOpen] = React.useState(false);
  const [queryOpen, setQueryOpen] = React.useState(false);
  const [batchSize, setBatchSize] = React.useState(8);
  const [strategy, setStrategy] = React.useState<"uncertainty" | "diversity" | "random">("uncertainty");

  const predictions = predictionsQuery.data;
  const metrics = metricsQuery.data;
  const project = predictions?.project ?? metrics?.project;
  const suggestions = predictions?.suggestions ?? [];
  const pending = suggestions.filter((suggestion) => suggestion.status === "pending");
  const latest = metrics?.latest ?? null;
  const previousAccuracy = React.useMemo(() => {
    if (!metrics || metrics.iterations.length < 2) return null;
    return metrics.iterations[metrics.iterations.length - 2]?.accuracy ?? null;
  }, [metrics]);

  const runQuery = React.useCallback(
    async (force = false) => {
      try {
        const result = await queryBatch.mutateAsync({
          size: batchSize,
          strategy,
          force,
        });
        resetLabeling();
        setQueryOpen(false);
        toast.success(`Round ${result.batch.iteration} batch ready`, {
          description: `${result.suggestions.length} uncertainty-ranked patches · ${result.poolRemaining.toLocaleString()} left in pool`,
        });
      } catch (error) {
        toast.error("Query failed", { description: getErrorMessage(error) });
      }
    },
    [batchSize, queryBatch, resetLabeling, strategy],
  );

  if (predictionsQuery.isLoading || !predictions || !project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-[74px] rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[440px] rounded-xl" />
          <Skeleton className="h-[440px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold tracking-tight">Active learning loop</h1>
            <Badge variant="primary">
              <Sparkles className="size-2.5" /> uncertainty sampling
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            The model surfaces the patches it is least sure about. Accept, correct or skip them, then
            retrain — each round is versioned with its metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQueryOpen(true)} loading={queryBatch.isPending}>
            <Layers className="size-3.5" /> Query next batch
          </Button>
          <Button size="sm" onClick={() => setTrainOpen(true)}>
            <Play className="size-3.5" /> Submit & retrain
          </Button>
        </div>
      </div>

      <MetricsStrip
        iteration={latest}
        pendingSuggestions={pending.length}
        isLoading={metricsQuery.isLoading}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_382px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-2">
                <p className="text-[12.5px] font-semibold">Spatial review</p>
                <Badge variant={pending.length > 0 ? "warning" : "default"}>
                  {pending.length} queued
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <SegmentedControl
                  options={BAND_PRESETS.map((preset) => ({ value: preset.id, label: preset.short }))}
                  value={bandPreset}
                  onChange={setBandPreset}
                  size="sm"
                />
                <Link href={`/projects/${projectId}/map`} className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Full map <ArrowUpRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
            <MapCanvas
              project={project}
              scenes={predictions.scenes}
              samples={predictions.samples}
              suggestions={suggestions}
              activeSceneId={predictions.scenes[0]?.id ?? null}
              bandPreset={bandPreset}
              opacity={opacity}
              showRaster
              showLabels
              showSuggestions
              tool="pan"
              activeClassId={project.classes[0]?.id ?? null}
              selectedSuggestionId={selectedSuggestionId}
              onSelectSuggestion={selectSuggestion}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[10px] text-muted">
              <span>Numbers match the review queue order · click a pin to jump to its card.</span>
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-primary" /> labels
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400" /> suggestions
                </span>
              </span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <ConfusionMatrixCard iteration={latest} classes={project.classes} compact />
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold">Class balance</p>
                  <p className="text-[10.5px] text-muted">Labels vs queued suggestions</p>
                </div>
                <Badge variant="default">{project.numClasses} classes</Badge>
              </div>
              <div className="p-2">
                <ClassDistributionChart data={metrics?.classDistribution ?? []} height={198} />
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold">Pool status</p>
                <p className="text-[10.5px] text-muted">
                  Unlabeled patches awaiting a query · strategy: {strategy}
                </p>
              </div>
              <span className="text-[13px] font-semibold tabular-nums text-primary">
                {predictions.poolRemaining.toLocaleString()}
              </span>
            </div>
            <Progress
              value={
                predictions.poolRemaining > 0
                  ? Math.max(
                      4,
                      100 -
                        (predictions.poolRemaining /
                          (predictions.poolRemaining + project.stats.labeledSamples + 1)) *
                          100,
                    )
                  : 100
              }
              className="mt-2"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
              <span>
                {project.stats.labeledSamples} labels collected · {project.stats.sceneCount} scenes ·{" "}
                {metrics?.iterations.length ?? 0} rounds
              </span>
              <button
                type="button"
                onClick={() => void runQuery(true)}
                className="font-medium text-primary hover:underline disabled:opacity-50"
                disabled={queryBatch.isPending}
              >
                Refresh batch
              </button>
            </div>
          </Card>
        </div>

        <div className="xl:sticky xl:top-[112px] xl:self-start">
          <SuggestionPanel
            project={project}
            batch={predictions.batch}
            suggestions={suggestions}
            poolRemaining={predictions.poolRemaining}
            isLoading={predictionsQuery.isLoading}
            onOpenTrain={() => setTrainOpen(true)}
            onQueryBatch={() => setQueryOpen(true)}
            querying={queryBatch.isPending}
          />
        </div>
      </div>

      <Dialog
        open={queryOpen}
        onOpenChange={setQueryOpen}
        title="Query the unlabeled pool"
        description="The backend ranks patches by predictive entropy and returns the most informative ones."
        footer={
          <>
            <Button variant="ghost" onClick={() => setQueryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void runQuery(false)} loading={queryBatch.isPending}>
              <Sparkles className="size-4" />
              {predictions.batch?.status === "pending" ? "Reuse pending batch" : "Fetch batch"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium">Batch size</p>
            <div className="grid grid-cols-4 gap-2">
              {BATCH_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBatchSize(size)}
                  className={
                    batchSize === size
                      ? "rounded-lg border border-primary/50 bg-primary/10 px-2 py-2 text-[12px] font-semibold text-primary"
                      : "rounded-lg border border-line bg-surface-muted/50 px-2 py-2 text-[12px] text-muted hover:text-foreground"
                  }
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium">Acquisition strategy</p>
            <SegmentedControl
              options={[
                { value: "uncertainty", label: "Entropy" },
                { value: "diversity", label: "Diversity" },
                { value: "random", label: "Random" },
              ]}
              value={strategy}
              onChange={(next) => setStrategy(next as typeof strategy)}
              className="w-full"
            />
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
              {strategy === "uncertainty"
                ? "Ranks patches with the highest predictive entropy — purest active learning signal."
                : strategy === "diversity"
                  ? "Adds spatial jitter to entropy ranking to avoid clustered suggestions."
                  : "Random baseline used to benchmark the active-learning gains."}
            </p>
          </div>
          {predictions.batch?.status === "pending" ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[10.5px] text-amber-500">
              A batch for round {predictions.batch.iteration} is still pending. Submitting the dialog
              reuses it to keep the query history consistent.
            </p>
          ) : null}
        </div>
      </Dialog>

      <TrainDialog
        projectId={projectId}
        open={trainOpen}
        onOpenChange={setTrainOpen}
        previousAccuracy={previousAccuracy}
        onQueryNext={() => setQueryOpen(true)}
      />
    </div>
  );
}
