/** Shared class color palette used by seeds, defaults and the UI legend. */
export const CLASS_PALETTE = [
  "#34D399", // emerald
  "#38BDF8", // sky
  "#FBBF24", // amber
  "#A78BFA", // violet
  "#FB7185", // rose
  "#2DD4BF", // teal
  "#FB923C", // orange
  "#818CF8", // indigo
  "#A3E635", // lime
  "#E879F9", // fuchsia
  "#F472B6", // pink
  "#94A3B8", // slate
] as const;

export function colorForClass(index: number): string {
  return CLASS_PALETTE[index % CLASS_PALETTE.length];
}

export function slugifyClassId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? `${slug}-${index}` : `class-${index}`;
}

/** Ramps used by the map raster previews and mini charts. */
export const NDVI_RAMP = ["#0B3D91", "#3B82F6", "#D6D3D1", "#A3E635", "#15803D"];
export const VIRIDIS_RAMP = [
  "#440154",
  "#414487",
  "#2A788E",
  "#22A884",
  "#7AD151",
  "#FDE725",
];
