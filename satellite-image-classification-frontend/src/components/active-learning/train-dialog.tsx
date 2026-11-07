"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/feedback";
import { useTrainModel } from "@/hooks/use-active-learning";
import { getErrorMessage } from "@/lib/api-client";
import { cn, formatNumber, formatPercent } from "@/lib/utils";
import type { IterationMetrics } from "@/types";

const STEPS = [
  "Assembling labeled batch",
  "Extracting 64×64 patches",
  "Fine-tuning U-Net decoder",
  "Scoring held-out validation split",
  "Ranking the unlabeled pool",
];

export function TrainDialog({
  projectId,
  open,
  onOpenChange,
  previousAccuracy,
  onQueryNext,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousAccuracy: number | null;
  onQueryNext?: () => void;
}) {
  const trainModel = useTrainModel(projectId);
  const [phase, setPhase] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [stepIndex, setStepIndex] = React.useState(0);
  const [result, setResult] = React.useState<IterationMetrics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const startedRef = React.useRef(false);

  const run = React.useCallback(async () => {
    setPhase("running");
    setStepIndex(0);
    setResult(null);
    setError(null);

    const timer = window.setInterval(() => {
      setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    }, 620);

    try {
      const iteration = await trainModel.mutateAsync({});
      setResult(iteration);
      setPhase("done");
      toast.success(`Round ${iteration.iteration} trained`, {
        description: `Accuracy ${formatPercent(iteration.accuracy)} · F1 ${iteration.f1.toFixed(3)}`,
      });
    } catch (caught) {
      setError(getErrorMessage(caught));
      setPhase("error");
      toast.error("Training failed", { description: getErrorMessage(caught) });
    } finally {
      window.clearInterval(timer);
    }
  }, [trainModel]);

  React.useEffect(() => {
    if (!open) {
      startedRef.current = false;
      setPhase("idle");
      setStepIndex(0);
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      void run();
    }
  }, [open, run]);

  const delta =
    result && previousAccuracy !== null ? result.accuracy - previousAccuracy : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={phase === "done" ? "Training round complete" : "Retraining the classifier"}
      description={
        phase === "done"
          ? "Metrics were versioned and the unlabeled pool re-scored."
          : "The active-learning worker is fine-tuning on your latest labels."
      }
      footer={
        phase === "done" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {onQueryNext ? (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onQueryNext();
                }}
              >
                <Sparkles className="size-4" /> Query next batch
              </Button>
            ) : null}
          </>
        ) : phase === "error" ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => void run()}>Try again</Button>
          </>
        ) : (
          <p className="text-[10.5px] text-muted">Usually takes a few seconds on the demo worker…</p>
        )
      }
    >
      {phase === "done" && result ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Accuracy", value: formatPercent(result.accuracy), accent: true },
              { label: "Macro F1", value: result.f1.toFixed(3) },
              { label: "Kappa", value: result.kappa.toFixed(3) },
              { label: "Labels", value: formatNumber(result.labeledSamples) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line bg-surface-muted/40 p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted">{item.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-[15px] font-semibold tabular-nums",
                    item.accent && "text-primary",
                  )}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          {delta !== null ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-[11px] text-primary">
              <TrendingUp className="size-3.5" />
              Accuracy {delta >= 0 ? "improved" : "moved"} {Math.abs(delta * 100).toFixed(1)}pp in round{" "}
              {result.iteration}.
            </div>
          ) : null}
          <Card className="p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold">
              <CheckCircle2 className="size-3.5 text-primary" /> Per-class F1
            </p>
            <div className="mt-2 space-y-1">
              {result.classMetrics.map((metric) => (
                <div key={metric.classId} className="flex items-center justify-between text-[10.5px]">
                  <span className="capitalize text-muted">{metric.classId.replace(/-\d+$/, "").replace(/-/g, " ")}</span>
                  <span className="font-medium tabular-nums">{metric.f1.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted/40 px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              {phase === "error" ? (
                <span className="text-sm font-bold">!</span>
              ) : (
                <Loader2 className="size-4 animate-spin" />
              )}
            </span>
            <div>
              <p className="text-[12px] font-semibold">
                {phase === "error" ? "Training error" : `Epoch 12/24 · ${STEPS[stepIndex]}`}
              </p>
              <p className="text-[10.5px] text-muted">
                {phase === "error" ? error : "U-Net · ResNet-34 encoder · 64px patches"}
              </p>
            </div>
          </div>
          <Progress
            value={phase === "error" ? 100 : ((stepIndex + 1) / STEPS.length) * 92}
            indicatorClassName={phase === "error" ? "bg-danger" : undefined}
          />
          <ol className="space-y-1.5">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className={cn(
                  "flex items-center gap-2 text-[11px]",
                  index < stepIndex || phase === "done"
                    ? "text-foreground"
                    : index === stepIndex
                      ? "text-primary"
                      : "text-muted",
                )}
              >
                {index < stepIndex || phase === "done" ? (
                  <CheckCircle2 className="size-3.5 text-primary" />
                ) : index === stepIndex ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-3.5 rounded-full border border-line" />
                )}
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Dialog>
  );
}
