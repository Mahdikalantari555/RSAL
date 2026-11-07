"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Map as MapIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/feedback";
import { MapView } from "@/components/map/map-view";
import { useDataset } from "@/hooks/use-dataset";
import { usePredictions } from "@/hooks/use-active-learning";

export default function MapPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const datasetQuery = useDataset(projectId);
  const predictionsQuery = usePredictions(projectId);

  const dataset = datasetQuery.data;
  const predictions = predictionsQuery.data;

  if (datasetQuery.isLoading || !dataset) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_332px]">
          <Skeleton className="h-[560px] rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold tracking-tight">Map viewer & labeling</h1>
            <Badge variant="info">
              <MapIcon className="size-2.5" /> {dataset.scenes.length} scenes
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Switch band combinations, inspect the footprint and draw training samples straight onto
            the imagery. Every shape is immediately added to the next training round.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${projectId}/data`}>
            <Button variant="secondary" size="sm">
              Manage dataset
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/active-learning`}>
            <Button size="sm">
              <Sparkles className="size-3.5" /> Active learning <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <MapView
        project={dataset.project}
        scenes={dataset.scenes}
        samples={dataset.samples}
        suggestions={predictions?.suggestions ?? []}
      />
    </div>
  );
}
