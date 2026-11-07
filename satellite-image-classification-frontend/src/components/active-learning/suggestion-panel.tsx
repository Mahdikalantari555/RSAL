"use client";

import * as React from "react";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flame,
  Loader2,
  MapPin,
  RotateCcw,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Kbd, Progress, Skeleton } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/form-controls";
import { useSubmitLabels } from "@/hooks/use-dataset";
import { getErrorMessage } from "@/lib/api-client";
import { generateRasterDataUrl } from "@/lib/raster";
import { cn, formatPercent } from "@/lib/utils";
import { useLabelingStore } from "@/store/use-labeling-store";
import { useMapStore } from "@/store/use-map-store";
import type { Project, QueryBatch, Suggestion } from "@/types";

export function SuggestionPanel({
  project,
  batch,
  suggestions,
  poolRemaining,
  isLoading,
  onOpenTrain,
  onQueryBatch,
  querying,
}: {
  project: Project;
  batch: QueryBatch | null;
  suggestions: Suggestion[];
  poolRemaining: number;
  isLoading?: boolean;
  onOpenTrain: () => void;
  onQueryBatch: () => void;
  querying: boolean;
}) {
  const initialize = useLabelingStore((state) => state.initialize);
  const drafts = useLabelingStore((state) => state.drafts);
  const cursor = useLabelingStore((state) => state.cursor);
  const setCursor = useLabelingStore((state) => state.setCursor);
  const step = useLabelingStore((state) => state.step);
  const setStatus = useLabelingStore((state) => state.setStatus);
  const assignClass = useLabelingStore((state) => state.assignClass);
  const setNote = useLabelingStore((state) => state.setNote);
  const toPayload = useLabelingStore((state) => state.toPayload);
  const selectSuggestion = useMapStore((state) => state.selectSuggestion);

  const submitLabels = useSubmitLabels(project.id);
  const noteRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    initialize(batch?.id ?? null, suggestions);
  }, [batch?.id, suggestions, initialize]);

  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === "pending");
  const active =
    suggestions[cursor] ??
    pendingSuggestions[0] ??
    suggestions[0] ??
    null;
  const entry = active ? drafts[active.id] : undefined;

  React.useEffect(() => {
    selectSuggestion(active?.id ?? null);
  }, [active?.id, selectSuggestion]);

  const handled = suggestions.filter((suggestion) => {
    const draft = drafts[suggestion.id];
    return draft ? draft.status !== "pending" : suggestion.status !== "pending";
  }).length;
  const total = suggestions.length;
  const progress = total > 0 ? (handled / total) * 100 : 0;

  const patchUrl = React.useMemo(() => {
    if (!active) return "";
    return generateRasterDataUrl(`${active.id}:patch`, "false_color", 132, 92);
  }, [active]);

  const handleSkip = React.useCallback(
    (suggestionId: string) => {
      setStatus(suggestionId, "skipped");
      step(1, suggestions.length);
    },
    [setStatus, step, suggestions.length],
  );

  const handleAccept = React.useCallback(
    (suggestionId: string) => {
      setStatus(suggestionId, "accepted");
      step(1, suggestions.length);
    },
    [setStatus, step, suggestions.length],
  );

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!active) return;
      const key = event.key.toLowerCase();
      if (key === "a" || key === "enter") {
        event.preventDefault();
        handleAccept(active.id);
      } else if (key === "s") {
        event.preventDefault();
        handleSkip(active.id);
      } else if (key === "arrowright" || key === "j") {
        step(1, suggestions.length);
      } else if (key === "arrowleft" || key === "k") {
        step(-1, suggestions.length);
      } else if (key === "n") {
        noteRef.current?.focus();
      } else if (/^[1-9]$/.test(key)) {
        const cls = project.classes[Number(key) - 1];
        if (cls) assignClass(active.id, cls.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, assignClass, handleAccept, handleSkip, project.classes, step, suggestions.length]);

  const handleAcceptRemaining = () => {
    for (const suggestion of suggestions) {
      const draft = drafts[suggestion.id];
      if (!draft || draft.status === "pending") {
        setStatus(suggestion.id, "accepted");
      }
    }
    toast.success("Predictions accepted", { description: "Review the batch and submit." });
  };

  const handleSubmit = async () => {
    const payload = toPayload();
    if (payload.length === 0) {
      toast.error("Nothing to submit", { description: "Accept, correct or skip at least one patch." });
      return;
    }
    try {
      const response = await submitLabels.mutateAsync({
        batchId: batch?.id ?? null,
        labels: payload.map((label) => ({
          suggestionId: label.suggestionId,
          status: label.status,
          classId: label.classId,
          note: label.note,
        })),
      });
      toast.success(`${response.inserted} labels submitted`, {
        description: "Retrain to fold them into the model.",
      });
      onOpenTrain();
    } catch (error) {
      toast.error("Could not submit labels", { description: getErrorMessage(error) });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No batch in review"
          description="Query the unlabeled pool to fetch the patches the model is least certain about. Humans review only what matters."
          action={
            <Button size="sm" onClick={onQueryBatch} loading={querying}>
              <Sparkles className="size-3.5" /> Query next batch
            </Button>
          }
        />
        <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[10.5px] text-muted">
          <p className="flex items-center justify-between">
            <span>Unlabeled pool</span>
            <span className="font-semibold text-foreground">{poolRemaining.toLocaleString()} patches</span>
          </p>
          <p className="mt-1">Strategy: entropy sampling over class probabilities.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold">
              Batch review {batch ? `· round ${batch.iteration}` : ""}
            </p>
            <p className="text-[10.5px] text-muted">
              {handled}/{total} reviewed · {poolRemaining.toLocaleString()} patches left in pool
            </p>
          </div>
          <Badge variant={handled === total ? "success" : "primary"}>
            {Math.round(progress)}%
          </Badge>
        </div>
        <Progress value={progress} className="mt-2" />
        <div className="mt-2 flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={handleAcceptRemaining}>
            <CheckCheck className="size-3.5" /> Accept remaining
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => initialize(batch?.id ?? null, suggestions, true)}
            aria-label="Clear drafts"
            title="Discard draft decisions"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="max-h-[268px] space-y-1.5 overflow-y-auto pr-0.5">
        {suggestions.map((suggestion, index) => {
          const draft = drafts[suggestion.id];
          const cls = project.classes.find((item) => item.id === suggestion.predictedClassId);
          const status = draft?.status ?? suggestion.status;
          const selected = active?.id === suggestion.id;
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => setCursor(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition",
                selected
                  ? "border-primary/50 bg-primary/8"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted/50",
              )}
            >
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-slate-950"
                style={{ backgroundColor: cls?.color ?? "#94A3B8" }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium">{cls?.name ?? "Unknown"}</p>
                <p className="text-[9.5px] text-muted">
                  conf {formatPercent(suggestion.confidence)} · σ {formatPercent(suggestion.uncertainty)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
                  status === "accepted"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : status === "overridden"
                      ? "bg-violet-500/15 text-violet-400"
                      : status === "skipped"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-surface-muted text-muted",
                )}
              >
                {status === "pending" ? "new" : status.slice(0, 4)}
              </span>
            </button>
          );
        })}
      </div>

      {active && entry ? (
        <div className="rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-[132px_1fr] gap-3 border-b border-line p-3">
            <div className="relative overflow-hidden rounded-lg border border-line bg-slate-900">
              {patchUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={patchUrl} alt="Suggested patch" className="size-full object-cover" />
              ) : (
                <div className="size-full bg-gradient-to-br from-emerald-900 to-slate-900" />
              )}
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <Crosshair className="size-4 text-white/80 drop-shadow" />
              </span>
              <span className="absolute left-1 top-1 rounded bg-slate-950/70 px-1 py-0.5 font-mono text-[8.5px] text-slate-200">
                64×64 px
              </span>
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11.5px] font-semibold">Model prediction</p>
                <Badge variant="warning">
                  <Flame className="size-2.5" /> σ {formatPercent(active.uncertainty)}
                </Badge>
              </div>
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      project.classes.find((cls) => cls.id === active.predictedClassId)?.color ?? "#94A3B8",
                  }}
                />
                {project.classes.find((cls) => cls.id === active.predictedClassId)?.name ?? "Unknown"}
                <span className="text-muted">· {formatPercent(active.confidence)}</span>
              </p>
              <p className="flex items-center gap-1 font-mono text-[9.5px] text-muted">
                <MapPin className="size-2.5" /> {active.lat.toFixed(5)}, {active.lng.toFixed(5)}
              </p>
              <div className="flex items-center gap-1 pt-0.5">
                <span className="text-[9px] uppercase text-muted">uncertainty</span>
                <Progress
                  value={active.uncertainty * 100}
                  className="h-1 flex-1"
                  indicatorClassName="bg-warning"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Assign ground truth
            </p>
            <div className="grid grid-cols-2 gap-1">
              {project.classes.map((cls, index) => {
                const selected = entry.classId === cls.id && entry.status !== "skipped";
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => assignClass(active.id, cls.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[10.5px] transition",
                      selected
                        ? "border-primary/50 bg-primary/10 font-semibold text-foreground"
                        : "border-line text-muted hover:border-line-strong hover:text-foreground",
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cls.color }} />
                    <span className="min-w-0 flex-1 truncate">{cls.name}</span>
                    <Kbd>{index + 1}</Kbd>
                  </button>
                );
              })}
            </div>

            <Textarea
              ref={noteRef}
              value={entry.note}
              onChange={(event) => setNote(active.id, event.target.value)}
              placeholder="Optional note — why is this patch hard? (N)"
              className="min-h-14 text-[11px]"
            />

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => step(-1, suggestions.length)}
                aria-label="Previous suggestion"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => handleSkip(active.id)}
              >
                <SkipForward className="size-3.5" /> Skip
              </Button>
              <Button size="sm" className="flex-1" onClick={() => handleAccept(active.id)}>
                <Check className="size-3.5" /> Accept
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => step(1, suggestions.length)}
                aria-label="Next suggestion"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
            <p className="flex flex-wrap items-center gap-1 text-[9.5px] text-muted">
              <Kbd>A</Kbd> accept · <Kbd>S</Kbd> skip · <Kbd>1–9</Kbd> class · <Kbd>N</Kbd> note ·{" "}
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> move
            </p>
          </div>

          <div className="border-t border-line p-3">
            <Button
              className="w-full"
              onClick={() => void handleSubmit()}
              loading={submitLabels.isPending}
              disabled={handled === 0}
            >
              {submitLabels.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" /> Submit labels & retrain
                </>
              )}
            </Button>
            <p className="mt-1.5 text-center text-[9.5px] text-muted">
              {handled} of {total} reviewed · {pendingSuggestions.length} still untouched
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
