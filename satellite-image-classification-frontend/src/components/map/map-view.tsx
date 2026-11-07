"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  BoxSelect,
  Circle,
  Eye,
  EyeOff,
  Hand,
  Layers,
  MousePointerClick,
  Pentagon,
  Settings2,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Kbd, Progress, Skeleton } from "@/components/ui/feedback";
import { SegmentedControl, Select, Slider, Switch } from "@/components/ui/form-controls";
import { ClassLegend } from "@/components/active-learning/metrics-overview";
import { BAND_PRESETS } from "@/lib/raster";
import { useMapStore } from "@/store/use-map-store";
import { useSubmitLabels, useDeleteSample, useUpdateSample } from "@/hooks/use-dataset";
import { getErrorMessage } from "@/lib/api-client";
import { cn, formatPercent, formatRelativeTime } from "@/lib/utils";
import type { DataScene, LabelledSample, Project, SampleGeometry, Suggestion } from "@/types";

const MapCanvas = dynamic(() => import("@/components/map/map-canvas").then((mod) => mod.MapCanvas), {
  ssr: false,
  loading: () => <div className="shimmer h-[clamp(380px,58vh,640px)] w-full" />,
});

const TOOLS = [
  { value: "pan", label: "Pan", icon: Hand, key: "V" },
  { value: "point", label: "Point", icon: Circle, key: "P" },
  { value: "polygon", label: "Polygon", icon: Pentagon, key: "G" },
  { value: "rectangle", label: "Box", icon: BoxSelect, key: "R" },
] as const;

export function MapView({
  project,
  scenes,
  samples,
  suggestions,
}: {
  project: Project;
  scenes: DataScene[];
  samples: LabelledSample[];
  suggestions: Suggestion[];
}) {
  const {
    tool,
    setTool,
    activeClassId,
    setActiveClass,
    bandPreset,
    setBandPreset,
    customBands,
    setCustomBand,
    opacity,
    setOpacity,
    showRaster,
    showLabels,
    showSuggestions,
    toggleLayer,
    activeSceneId,
    setActiveScene,
    selectedSuggestionId,
    selectSuggestion,
    syncWithProject,
  } = useMapStore();

  const submitLabels = useSubmitLabels(project.id);
  const updateSample = useUpdateSample(project.id);
  const deleteSample = useDeleteSample(project.id);
  const [pendingCount, setPendingCount] = React.useState(0);

  React.useEffect(() => {
    syncWithProject(project.classes, scenes);
  }, [project.classes, scenes, syncWithProject]);

  const handleCreateSample = React.useCallback(
    async (geometry: SampleGeometry) => {
      if (!activeClassId) {
        toast.error("Select a class before drawing");
        return;
      }
      const sceneId = activeSceneId ?? scenes[0]?.id ?? null;
      setPendingCount((count) => count + 1);
      try {
        await submitLabels.mutateAsync({
          samples: [{ geometry, classId: activeClassId, sceneId, source: "human" }],
        });
        const cls = project.classes.find((item) => item.id === activeClassId);
        toast.success(`${cls?.name ?? "Sample"} label added`, {
          description: `${geometry.type} saved to the training set.`,
          duration: 1600,
        });
      } catch (error) {
        toast.error("Could not save label", { description: getErrorMessage(error) });
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    },
    [activeClassId, activeSceneId, project.classes, scenes, submitLabels],
  );

  React.useEffect(() => {
    if (!activeClassId && project.classes.length > 0) {
      setActiveClass(project.classes[0].id);
    }
  }, [activeClassId, project.classes, setActiveClass]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "v") setTool("pan");
      else if (key === "p") setTool("point");
      else if (key === "g") setTool("polygon");
      else if (key === "b" || key === "r") setTool("rectangle");
      else if (key === "escape") setTool("pan");
      else if (/^[1-9]$/.test(key)) {
        const cls = project.classes[Number(key) - 1];
        if (cls) setActiveClass(cls.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project.classes, setActiveClass, setTool]);

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const classCounts = Object.fromEntries(
    project.classes.map((cls) => [cls.id, samples.filter((sample) => sample.classId === cls.id).length]),
  );
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === "pending");

  const handleClassCorrection = async (sampleId: string, classId: string) => {
    try {
      await updateSample.mutateAsync({ sampleId, classId });
      toast.success("Label corrected");
    } catch (error) {
      toast.error("Could not update label", { description: getErrorMessage(error) });
    }
  };

  const handleDelete = async (sampleId: string) => {
    try {
      await deleteSample.mutateAsync(sampleId);
      toast.success("Label removed");
    } catch (error) {
      toast.error("Could not delete label", { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_332px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted/50 p-0.5">
                {TOOLS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTool(item.value)}
                    title={`${item.label} (${item.key})`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11px] font-medium transition",
                      tool === item.value
                        ? "bg-surface text-primary shadow-sm"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-3.5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="hidden h-5 w-px bg-line sm:block" />

              <SegmentedControl
                options={BAND_PRESETS.map((preset) => ({ value: preset.id, label: preset.short }))}
                value={bandPreset}
                onChange={setBandPreset}
                size="sm"
              />

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden items-center gap-1.5 md:flex">
                  <Layers className="size-3.5 text-muted" />
                  <button
                    type="button"
                    onClick={() => toggleLayer("raster")}
                    className={cn("rounded p-1", showRaster ? "text-primary" : "text-muted")}
                    aria-label="Toggle raster layer"
                    title="Scene raster preview"
                  >
                    {showRaster ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </div>
                <Select
                  value={activeSceneId ?? ""}
                  onChange={(event) => setActiveScene(event.target.value)}
                  className="h-8 w-[168px] text-[11px]"
                  aria-label="Active scene"
                >
                  {scenes.length === 0 ? <option value="">No scenes</option> : null}
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {bandPreset === "custom_rgb" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface-muted/35 px-3 py-2">
                <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted">
                  Channel mapping
                </span>
                {(["R", "G", "B"] as const).map((channel, index) => (
                  <div key={channel} className="flex items-center gap-1.5">
                    <span
                      className="grid size-4 place-items-center rounded text-[9px] font-bold text-slate-950"
                      style={{
                        backgroundColor:
                          index === 0 ? "#F87171" : index === 1 ? "#4ADE80" : "#60A5FA",
                      }}
                    >
                      {channel}
                    </span>
                    <Select
                      value={customBands[index]}
                      onChange={(event) =>
                        setCustomBand(index as 0 | 1 | 2, Number(event.target.value))
                      }
                      className="h-7 w-[122px] text-[10.5px]"
                      aria-label={`${channel} channel band`}
                    >
                      {(activeScene?.bands ?? []).map((band, bandIndex) => (
                        <option key={band} value={bandIndex}>
                          {band}
                        </option>
                      ))}
                      {(activeScene?.bands.length ?? 0) === 0 ? (
                        <option value={index}>Band {index + 1}</option>
                      ) : null}
                    </Select>
                  </div>
                ))}
                <span className="text-[9.5px] text-muted">stretch 2–98% · gamma 1.0</span>
              </div>
            ) : null}

            <div className="relative bg-slate-950">
              <MapCanvas
                project={project}
                scenes={scenes}
                samples={samples}
                suggestions={suggestions}
                activeSceneId={activeSceneId}
                bandPreset={bandPreset}
                customBands={customBands}
                opacity={opacity}
                showRaster={showRaster}
                showLabels={showLabels}
                showSuggestions={showSuggestions}
                tool={tool}
                activeClassId={activeClassId}
                selectedSuggestionId={selectedSuggestionId}
                onSelectSuggestion={(id) => {
                  selectSuggestion(id);
                  const suggestion = suggestions.find((item) => item.id === id);
                  if (suggestion) {
                    const cls = project.classes.find((item) => item.id === suggestion.predictedClassId);
                    toast.info(`Suggestion selected`, {
                      description: `${cls?.name ?? "Unknown"} · ${formatPercent(suggestion.confidence)} confidence`,
                    });
                  }
                }}
                onCreateSample={(geometry) => void handleCreateSample(geometry)}
              />
              {scenes.length === 0 ? (
                <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
                  <div className="max-w-sm rounded-xl border border-line bg-surface p-4 text-center">
                    <p className="text-[13px] font-semibold">No scenes to display</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Upload a GeoTIFF first, then come back to draw training samples.
                    </p>
                    <Link href={`/projects/${project.id}/data`}>
                      <Button size="sm" className="mt-3">
                        Upload imagery <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted">
                <span>{BAND_PRESETS.find((preset) => preset.id === bandPreset)?.description}</span>
                <span className="inline-flex items-center gap-1">
                  <MousePointerClick className="size-3" />
                  {tool === "pan" ? "Pan & zoom" : "Drawing"}
                </span>
                {submitLabels.isPending ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Wand2 className="size-3 animate-pulse" /> saving label…
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">Opacity</span>
                <Slider
                  min={0}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                  className="w-24"
                  aria-label="Raster opacity"
                />
                <span className="w-7 text-right text-[10px] tabular-nums text-muted">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Training labels</p>
                <p className="text-[10.5px] text-muted">
                  {samples.length} samples · correct any mislabel right here
                </p>
              </div>
              <Badge variant={pendingCount > 0 ? "warning" : "default"}>
                {pendingCount > 0 ? `${pendingCount} saving` : "synced"}
              </Badge>
            </div>
            {samples.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Pentagon className="size-4" />}
                  title="No training samples yet"
                  description="Pick a class, choose the point or polygon tool and start clicking on the map."
                  className="border-0 bg-transparent py-3"
                />
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                <table className="w-full min-w-[520px] text-left text-[11.5px]">
                  <thead className="sticky top-0 bg-surface-muted/70 text-[9.5px] uppercase tracking-wide text-muted backdrop-blur">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Label</th>
                      <th className="px-3 py-2 font-semibold">Geometry</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-3 py-2 font-semibold">Correct class</th>
                      <th className="px-4 py-2 text-right font-semibold">Added</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {samples.slice(0, 40).map((sample) => {
                      const cls = project.classes.find((item) => item.id === sample.classId);
                      return (
                        <tr key={sample.id} className="hover:bg-surface-muted/40">
                          <td className="px-4 py-1.5">
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full" style={{ backgroundColor: cls?.color }} />
                              <span className="font-medium">{cls?.name ?? sample.classId}</span>
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-[10.5px] capitalize text-muted">
                            {sample.geometry.type.toLowerCase()}
                          </td>
                          <td className="px-3 py-1.5 text-[10.5px] text-muted">{sample.source}</td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={sample.classId}
                              onChange={(event) =>
                                void handleClassCorrection(sample.id, event.target.value)
                              }
                              className="h-7 w-[130px] text-[10.5px]"
                              aria-label="Correct class"
                            >
                              {project.classes.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-4 py-1.5 text-right text-[10px] text-muted">
                            {formatRelativeTime(sample.createdAt)}
                          </td>
                          <td className="pr-2">
                            <button
                              type="button"
                              aria-label="Delete label"
                              onClick={() => void handleDelete(sample.id)}
                              className="rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold">Assign class</p>
                <p className="text-[10.5px] text-muted">Used for the next shape you draw</p>
              </div>
              <Badge variant="primary">active</Badge>
            </div>
            <div className="mt-2.5">
              <ClassLegend
                classes={project.classes}
                counts={classCounts}
                activeClassId={activeClassId}
                onSelect={setActiveClass}
                compact
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
              <Kbd>1</Kbd>–<Kbd>9</Kbd> pick a class · <Kbd>Esc</Kbd> pan
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">Queued suggestions</p>
                <p className="text-[10.5px] text-muted">Uncertainty ranked</p>
              </div>
              <Badge variant="warning">{pendingSuggestions.length}</Badge>
            </div>
            <div className="max-h-[260px] divide-y divide-line overflow-y-auto">
              {pendingSuggestions.length === 0 ? (
                <p className="px-4 py-4 text-center text-[11px] text-muted">
                  No pending suggestions — query a batch from the active-learning tab.
                </p>
              ) : (
                pendingSuggestions.map((suggestion, index) => {
                  const cls = project.classes.find((item) => item.id === suggestion.predictedClassId);
                  const active = suggestion.id === selectedSuggestionId;
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => selectSuggestion(active ? null : suggestion.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-left transition",
                        active ? "bg-primary/8" : "hover:bg-surface-muted/50",
                      )}
                    >
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full text-[9.5px] font-bold text-slate-950"
                        style={{ backgroundColor: cls?.color ?? "#94A3B8" }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium">{cls?.name ?? "Unknown"}</p>
                        <p className="text-[9.5px] text-muted">
                          conf {formatPercent(suggestion.confidence)} · σ{" "}
                          {formatPercent(suggestion.uncertainty)}
                        </p>
                      </div>
                      <div className="w-10">
                        <Progress
                          value={suggestion.uncertainty * 100}
                          className="h-1"
                          indicatorClassName="bg-warning"
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-line px-4 py-2">
              <Link href={`/projects/${project.id}/active-learning`}>
                <Button variant="secondary" size="sm" className="w-full">
                  Review in loop <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Settings2 className="size-3.5 text-primary" /> Layers
            </p>
            <div className="mt-1.5 space-y-0.5">
              <Switch checked={showRaster} onChange={() => toggleLayer("raster")} label="Scene raster overlay" />
              <Switch checked={showLabels} onChange={() => toggleLayer("labels")} label="Training labels" />
              <Switch checked={showSuggestions} onChange={() => toggleLayer("suggestions")} label="Query suggestions" />
            </div>
            {activeScene ? (
              <div className="mt-2 space-y-1 border-t border-line pt-2 text-[10px] text-muted">
                <p className="flex justify-between">
                  <span>Bands</span>
                  <span className="font-medium text-foreground">{activeScene.bands.length}</span>
                </p>
                <p className="flex justify-between">
                  <span>Pixel size</span>
                  <span className="font-medium text-foreground">{activeScene.resolutionM}m</span>
                </p>
                <p className="flex justify-between">
                  <span>Projection</span>
                  <span className="font-medium text-foreground">{activeScene.crs}</span>
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            )}
          </Card>

          <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <Layers className="size-3.5" /> Tiling tip
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              Draw homogeneous polygons over pure pixels. Boundary pixels are exactly what the model
              is uncertain about — leave them for the query batch.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
