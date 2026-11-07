import type { Bounds } from "@/types";

export const DEFAULT_BOUNDS: Bounds = {
  north: 36.86,
  south: 36.68,
  east: -119.64,
  west: -119.88,
};

export const PRESET_AOIS = [
  {
    id: "central-valley",
    label: "Central Valley, CA",
    center: [36.77, -119.76] as [number, number],
    zoom: 11,
    bounds: { north: 36.86, south: 36.68, east: -119.64, west: -119.88 },
  },
  {
    id: "barataria",
    label: "Barataria Bay, LA",
    center: [29.48, -90.02] as [number, number],
    zoom: 11,
    bounds: { north: 29.57, south: 29.39, east: -89.9, west: -90.14 },
  },
  {
    id: "nairobi",
    label: "Nairobi, KE",
    center: [-1.2921, 36.8219] as [number, number],
    zoom: 11,
    bounds: { north: -1.2, south: -1.38, east: 36.94, west: 36.7 },
  },
  {
    id: "alps",
    label: "Bernese Alps, CH",
    center: [46.52, 8.02] as [number, number],
    zoom: 11,
    bounds: { north: 46.6, south: 46.44, east: 8.14, west: 7.9 },
  },
];

export function aoiFromPreset(presetId: string | undefined, label?: string) {
  const preset = PRESET_AOIS.find((item) => item.id === presetId) ?? PRESET_AOIS[0];
  return {
    center: preset.center,
    bounds: preset.bounds,
    zoom: preset.zoom,
    label: label ?? preset.label,
  };
}
