import { hashString, mulberry32 } from "@/lib/simulation";
import type { BandPresetId } from "@/types";

/**
 * Renders a deterministic scene preview for the selected band combination.
 * Real GeoTIFF pixels would be substituted here by a tile server; the shapes
 * (fields, water bodies, roads) make band-combination switching meaningful in
 * the demo environment.
 */
function buildNoise(seed: number, size: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const grid = Array.from({ length: size * size }, () => rng());
  return (x: number, y: number) => {
    const gx = ((x % size) + size) % size;
    const gy = ((y % size) + size) % size;
    return grid[gy * size + gx];
  };
}

function smoothNoise(noise: (x: number, y: number) => number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = noise(x0, y0);
  const n10 = noise(x0 + 1, y0);
  const n01 = noise(x0, y0 + 1);
  const n11 = noise(x0 + 1, y0 + 1);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

function octaves(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  baseFrequency: number,
): number {
  return (
    smoothNoise(noise, x * baseFrequency, y * baseFrequency) * 0.55 +
    smoothNoise(noise, x * baseFrequency * 2.3, y * baseFrequency * 2.3) * 0.28 +
    smoothNoise(noise, x * baseFrequency * 5.1, y * baseFrequency * 5.1) * 0.17
  );
}

const TRUE_COLOR = {
  water: [18, 44, 68],
  urban: [124, 118, 109],
  soil: [156, 128, 88],
  crop: [104, 130, 62],
  orchard: [66, 102, 58],
};

export function generateRasterDataUrl(
  seedKey: string,
  preset: BandPresetId,
  width = 300,
  height = 210,
  customBands: [number, number, number] = [2, 1, 0],
): string {
  if (typeof document === "undefined") return "";
  const seed = hashString(`${seedKey}:${preset === "custom_rgb" ? customBands.join("-") : ""}`);
  const noise = buildNoise(seed, 64);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(width, height);
  const rng = mulberry32(seed ^ 0x9e3779b9);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const fieldNoise = octaves(noise, x, y, 0.018);
      const texture = octaves(noise, x + 41, y + 17, 0.09);
      const vegetation = Math.min(1, Math.max(0, fieldNoise * 0.7 + texture * 0.45 - 0.1));
      const water = fieldNoise < 0.33 ? 1 : 0;
      const isRoad = Math.abs(((x * 0.6 + 9) % 47) - 23) < 0.9 || Math.abs(((y * 0.5 + 4) % 61) - 30) < 0.8;
      const fieldEdge =
        Math.abs((fieldNoise * 9) % 1) < 0.055 || Math.abs((texture * 13) % 1) < 0.045;

      let r = 0;
      let g = 0;
      let b = 0;

      if (preset === "true_color") {
        if (water) {
          [r, g, b] = TRUE_COLOR.water;
        } else if (isRoad) {
          [r, g, b] = TRUE_COLOR.urban;
        } else if (vegetation > 0.55) {
          const t = (vegetation - 0.55) / 0.45;
          r = TRUE_COLOR.orchard[0] + (TRUE_COLOR.crop[0] - TRUE_COLOR.orchard[0]) * t;
          g = TRUE_COLOR.orchard[1] + (TRUE_COLOR.crop[1] - TRUE_COLOR.orchard[1]) * t;
          b = TRUE_COLOR.orchard[2] + (TRUE_COLOR.crop[2] - TRUE_COLOR.orchard[2]) * t;
        } else {
          const t = vegetation / 0.55;
          r = TRUE_COLOR.soil[0] + (TRUE_COLOR.crop[0] - TRUE_COLOR.soil[0]) * t * 0.75;
          g = TRUE_COLOR.soil[1] + (TRUE_COLOR.crop[1] - TRUE_COLOR.soil[1]) * t * 0.75;
          b = TRUE_COLOR.soil[2] + (TRUE_COLOR.crop[2] - TRUE_COLOR.soil[2]) * t * 0.75;
        }
        const grain = (rng() - 0.5) * 14;
        r += grain;
        g += grain;
        b += grain;
      } else if (preset === "false_color") {
        if (water) {
          r = 10 + texture * 16;
          g = 26 + texture * 28;
          b = 52 + texture * 44;
        } else if (isRoad) {
          r = 168;
          g = 152;
          b = 148;
        } else {
          // NIR mapped into the red channel: vegetation glows crimson.
          const nir = 0.35 + vegetation * 0.65;
          r = 78 + nir * 168;
          g = 38 + (1 - nir) * 96 + texture * 22;
          b = 62 + (1 - nir) * 82 + texture * 26;
        }
      } else if (preset === "ndvi") {
        const ndvi = water ? -0.45 + texture * 0.08 : vegetation * 1.35 - 0.22 + (texture - 0.5) * 0.22;
        const value = Math.max(-1, Math.min(1, ndvi));
        if (value < -0.1) {
          const t = (value + 1) / 0.9;
          r = 12 + t * 47;
          g = 58 + t * 76;
          b = 132 + t * 47;
        } else if (value < 0.25) {
          const t = (value + 0.1) / 0.35;
          r = 90 + t * 128;
          g = 132 + t * 86;
          b = 122 + t * 28;
        } else {
          const t = Math.min(1, (value - 0.25) / 0.75);
          r = 118 - t * 80;
          g = 168 + t * 34;
          b = 82 - t * 34;
        }
      } else if (preset === "custom_rgb") {
        const channels = customBands.map((band, channelIndex) => {
          const value = octaves(
            noise,
            x + band * 11 + channelIndex * 3,
            y + band * 7 + channelIndex * 5,
            0.016 + band * 0.003,
          );
          return Math.max(0, Math.min(1, value * 1.3 - 0.08));
        });
        const dim = water ? 0.32 : fieldEdge ? 0.82 : 1;
        r = channels[0] * 246 * dim + (water ? 10 : 0);
        g = channels[1] * 236 * dim + (water ? 18 : 0);
        b = channels[2] * 226 * dim + (water ? 34 : 0);
      } else {
        // Uncertainty map on a viridis ramp.
        const boundary = fieldEdge || isRoad ? 0.85 : 0;
        const u = Math.min(1, Math.max(0, boundary * 0.65 + (1 - Math.abs(vegetation - 0.5) * 2) * 0.55 + (texture - 0.5) * 0.3));
        if (u < 0.25) {
          const t = u / 0.25;
          r = 68 + t * 10;
          g = 1 + t * 67;
          b = 84 + t * 8;
        } else if (u < 0.55) {
          const t = (u - 0.25) / 0.3;
          r = 78 + t * 58;
          g = 68 + t * 62;
          b = 92 - t * 92;
        } else {
          const t = (u - 0.55) / 0.45;
          r = 136 + t * 118;
          g = 130 + t * 96;
          b = 0 + t * 24;
        }
      }

      if (preset !== "uncertainty" && fieldEdge) {
        r *= 0.78;
        g *= 0.78;
        b *= 0.78;
      }

      image.data[index] = Math.max(0, Math.min(255, r));
      image.data[index + 1] = Math.max(0, Math.min(255, g));
      image.data[index + 2] = Math.max(0, Math.min(255, b));
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export const BAND_PRESETS: { id: BandPresetId; label: string; short: string; description: string }[] = [
  { id: "true_color", label: "True color", short: "RGB", description: "B04 · B03 · B02" },
  { id: "false_color", label: "False color", short: "NIR", description: "B08 · B04 · B03" },
  { id: "ndvi", label: "NDVI", short: "NDVI", description: "(B08 − B04) / (B08 + B04)" },
  { id: "uncertainty", label: "Uncertainty", short: "σ", description: "prediction entropy heatmap" },
  { id: "custom_rgb", label: "Custom RGB", short: "RGB⁺", description: "custom band → channel mapping" },
];
