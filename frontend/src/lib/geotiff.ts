import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import type { BandMode, Bounds, RasterMetadata } from '@/types';
function projection(code: number): string | null {
  if (code === 4326) return 'EPSG:4326';
  if (code === 3857) return 'EPSG:3857';
  if (code >= 32601 && code <= 32660)
    return `+proj=utm +zone=${code - 32600} +datum=WGS84 +units=m +no_defs`;
  if (code >= 32701 && code <= 32760)
    return `+proj=utm +zone=${code - 32700} +south +datum=WGS84 +units=m +no_defs`;
  if (code >= 26901 && code <= 26923)
    return `+proj=utm +zone=${code - 26900} +datum=NAD83 +units=m +no_defs`;
  return null;
}
export async function readMetadata(buffer: ArrayBuffer): Promise<RasterMetadata> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const keys = image.getGeoKeys();
  const code = Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey ?? 0);
  let bounds: Bounds | null = null;
  let resolution = 'Unknown';
  try {
    const raw = image.getBoundingBox();
    const from = projection(code);
    if (from) {
      const a = proj4(from, 'EPSG:4326', [raw[0], raw[1]]);
      const b = proj4(from, 'EPSG:4326', [raw[2], raw[3]]);
      if ([...a, ...b].every(Number.isFinite)) bounds = [a[0], a[1], b[0], b[1]];
    }
  } catch {
    /* A non-georeferenced TIFF can still be inspected. */
  }
  try {
    const r = image.getResolution();
    resolution = `${Math.abs(r[0]).toLocaleString('en', { maximumFractionDigits: 6 })} ${code === 4326 ? '°' : 'm'}`;
  } catch {
    /* No affine resolution. */
  }
  return {
    bands: image.getSamplesPerPixel(),
    width: image.getWidth(),
    height: image.getHeight(),
    resolution,
    crs: code ? `EPSG:${code}` : 'Not georeferenced',
    bounds,
  };
}
export async function renderRaster(
  buffer: ArrayBuffer,
  mode: BandMode = 'true-color',
  custom: [number, number, number] = [0, 1, 2],
): Promise<string> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const bandCount = image.getSamplesPerPixel();
  const ratio = Math.min(1, 1200 / Math.max(image.getWidth(), image.getHeight()));
  const width = Math.max(1, Math.round(image.getWidth() * ratio));
  const height = Math.max(1, Math.round(image.getHeight() * ratio));
  const red = bandCount >= 8 ? 3 : 0,
    nir = bandCount >= 8 ? 7 : 3;
  let channels = bandCount >= 8 ? [3, 2, 1] : bandCount >= 3 ? [0, 1, 2] : [0, 0, 0];
  if (mode === 'false-color') {
    if (bandCount < 4)
      throw new Error('False color needs at least four spectral bands, including near-infrared.');
    channels = [nir, red, bandCount >= 8 ? 2 : 1];
  }
  if (mode === 'custom') channels = custom.map((v) => Math.min(bandCount - 1, Math.max(0, v)));
  if (mode === 'ndvi') {
    if (bandCount < 4) throw new Error('NDVI requires red and near-infrared bands.');
    channels = [red, nir];
  }
  const unique = [...new Set(channels)];
  const raster = await image.readRasters({ samples: unique, width, height, interleave: false });
  const arrays = unique.map((_, i) => raster[i] as ArrayLike<number>);
  const noData = image.getGDALNoData();
  const ranges = arrays.map((arr) => {
    const values: number[] = [];
    const step = Math.max(1, Math.floor(arr.length / 5000));
    for (let i = 0; i < arr.length; i += step)
      if (Number.isFinite(Number(arr[i])) && arr[i] !== noData) values.push(Number(arr[i]));
    values.sort((a, b) => a - b);
    return [
      values[Math.floor(values.length * 0.02)] ?? 0,
      values[Math.floor(values.length * 0.98)] ?? 255,
    ];
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const pixels = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const value = Number(arrays[0][i]);
    if (!Number.isFinite(value) || (noData !== null && value === noData)) {
      pixels.data[base + 3] = 0;
      continue;
    }
    if (mode === 'ndvi') {
      const r = Number(arrays[unique.indexOf(red)][i]);
      const n = Number(arrays[unique.indexOf(nir)][i]);
      const ndvi = n + r === 0 ? 0 : (n - r) / (n + r);
      const v = Math.max(0, Math.min(1, (ndvi + 1) / 2));
      pixels.data[base] = Math.round(225 * (1 - v) + 25 * v);
      pixels.data[base + 1] = Math.round(115 * (1 - v) + 175 * v);
      pixels.data[base + 2] = Math.round(80 * (1 - v) + 72 * v);
    } else {
      channels.forEach((channel, c) => {
        const index = unique.indexOf(channel);
        const [lo, hi] = ranges[index];
        pixels.data[base + c] = Math.round(
          Math.max(0, Math.min(1, (Number(arrays[index][i]) - lo) / (hi - lo || 1))) * 255,
        );
      });
    }
    pixels.data[base + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export interface DecodedClusterRaster {
  width: number;
  height: number;
  indices: Uint16Array;
  noData: number;
}

export async function decodeClusterRaster(buffer: ArrayBuffer): Promise<DecodedClusterRaster> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const ratio = Math.min(1, 1200 / Math.max(image.getWidth(), image.getHeight()));
  const width = Math.max(1, Math.round(image.getWidth() * ratio));
  const height = Math.max(1, Math.round(image.getHeight() * ratio));
  const raster = await image.readRasters({
    samples: [0],
    width,
    height,
    resampleMethod: 'nearest',
    interleave: false,
  });
  const raw = raster[0] as ArrayLike<number>;
  const indices = new Uint16Array(width * height);
  for (let i = 0; i < width * height; i++) indices[i] = Number(raw[i]);
  const gdalNoData = image.getGDALNoData();
  return {
    width,
    height,
    indices,
    noData: gdalNoData != null && Number.isFinite(Number(gdalNoData)) ? Number(gdalNoData) : 65535,
  };
}

export function renderClusterOverlay(
  decoded: DecodedClusterRaster,
  colors: Record<number, [number, number, number]>,
  visibleClusters?: Set<number> | null,
): string {
  const { width, height, indices, noData } = decoded;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const pixels = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const cid = indices[i];
    const base = i * 4;
    if (cid === 65535 || cid === noData || (visibleClusters && !visibleClusters.has(cid))) {
      pixels.data[base + 3] = 0;
      continue;
    }
    const rgb = colors[cid] ?? [56, 142, 112];
    pixels.data[base] = rgb[0];
    pixels.data[base + 1] = rgb[1];
    pixels.data[base + 2] = rgb[2];
    pixels.data[base + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}
