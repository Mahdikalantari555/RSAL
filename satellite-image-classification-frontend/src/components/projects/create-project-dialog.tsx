"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { useCreateProject } from "@/hooks/use-projects";
import { PRESET_AOIS } from "@/lib/aoi";
import { CLASS_PALETTE } from "@/lib/palette";
import { getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SUGGESTED_CLASSES = ["Water", "Urban", "Cropland", "Forest", "Bare soil", "Wetland"];

const TEMPLATES: Record<string, { label: string; description: string; classes: string[]; aoi: string }> = {
  crops: {
    label: "Cropland mapping",
    description: "Distinguish irrigated crop types, fallow fields and water in an agricultural AOI.",
    classes: ["Water", "Urban", "Alfalfa", "Fallow", "Orchard", "Vineyard"],
    aoi: "central-valley",
  },
  urban: {
    label: "Urban growth",
    description: "Track built-up expansion, informal settlements and vegetation loss over time.",
    classes: ["Built-up", "Informal settlement", "Vegetation", "Bare soil", "Roads"],
    aoi: "nairobi",
  },
  wetland: {
    label: "Wetland monitoring",
    description: "Map marsh, mudflat and open water dynamics for restoration reporting.",
    classes: ["Open water", "Salt marsh", "Mudflat", "Upland vegetation"],
    aoi: "barataria",
  },
};

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const createProject = useCreateProject();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [aoiPreset, setAoiPreset] = React.useState(PRESET_AOIS[0].id);
  const [classes, setClasses] = React.useState<string[]>(["Water", "Urban", "Cropland", "Fallow"]);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setClasses(["Water", "Urban", "Cropland", "Fallow"]);
    setAoiPreset(PRESET_AOIS[0].id);
    setError(null);
  };

  const applyTemplate = (key: string) => {
    const template = TEMPLATES[key];
    if (!template) return;
    setClasses(template.classes);
    setDescription(template.description);
    setAoiPreset(template.aoi);
    if (!name) setName(template.label === "Cropland mapping" ? "Untitled crop mapping" : template.label);
  };

  const handleCreate = async () => {
    const trimmed = classes.map((value) => value.trim()).filter(Boolean);
    if (name.trim().length < 2) {
      setError("Give the project a name with at least 2 characters.");
      return;
    }
    if (trimmed.length < 2) {
      setError("Define at least two classes.");
      return;
    }
    if (new Set(trimmed.map((value) => value.toLowerCase())).size !== trimmed.length) {
      setError("Class names must be unique.");
      return;
    }
    try {
      const project = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        classes: trimmed,
        aoiPreset,
      });
      toast.success("Project created", {
        description: `${project.name} is ready — upload your first GeoTIFF to get started.`,
      });
      reset();
      onOpenChange(false);
      router.push(`/projects/${project.id}/data`);
    } catch (caught) {
      toast.error("Could not create project", { description: getErrorMessage(caught) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Create a labeling project"
      description="Define the classes once — every training round reuses this taxonomy."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={createProject.isPending}>
            <Sparkles className="size-4" />
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(TEMPLATES).map(([key, template]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyTemplate(key)}
              className="rounded-lg border border-line bg-surface-muted/50 px-2.5 py-1.5 text-[11px] font-medium text-muted transition hover:border-primary/40 hover:text-foreground"
            >
              <Sparkles className="mr-1 inline size-3 text-primary" />
              {template.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Central Valley crop mapping"
              autoFocus
            />
          </Field>
          <Field label="Area of interest" hint="basemap preview">
            <Select value={aoiPreset} onChange={(event) => setAoiPreset(event.target.value)}>
              {PRESET_AOIS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description" hint="optional">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What decision will this classification support?"
            className="min-h-16"
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              Label classes <span className="text-muted">({classes.length})</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setClasses((prev) => [...prev, `Class ${prev.length + 1}`])}
              disabled={classes.length >= 12}
            >
              <Plus className="size-3.5" /> Add class
            </Button>
          </div>
          <div className="space-y-2">
            {classes.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="size-4 shrink-0 rounded-[5px] ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: CLASS_PALETTE[index % CLASS_PALETTE.length] }}
                />
                <Input
                  value={value}
                  onChange={(event) =>
                    setClasses((prev) =>
                      prev.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                    )
                  }
                  className={cn("h-8 text-[13px]")}
                  placeholder={`Class ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setClasses((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                  disabled={classes.length <= 2}
                  aria-label={`Remove class ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTED_CLASSES.filter(
              (suggestion) => !classes.some((item) => item.toLowerCase() === suggestion.toLowerCase()),
            ).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setClasses((prev) => [...prev, suggestion])}
                className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[10.5px] text-muted transition hover:border-primary/50 hover:text-foreground"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
