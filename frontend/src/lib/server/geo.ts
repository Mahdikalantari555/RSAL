/**
 * Server-side coordinate helpers: dataset CRS <-> WGS84 display space,
 * affine pixel <-> map conversion mirroring the backend's raster_service.
 */
import proj4 from 'proj4';
import type { Bounds, SampleGeometry } from '@/types';
import type { RsalDataset } from './rsal';

proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
);

/** proj4 definition for the EPSG codes GeoTIFFs commonly carry. */
export function projectionDef(crs: string | null): string | null {
  if (!crs) return null;
  const match = /^EPSG:(\d+)$/i.exec(crs.trim());
  if (!match) return crs.includes('+proj') ? crs : null;
  const code = Number(match[1]);
  if (code === 4326 || code === 3857) return `EPSG:${code}`;
  if (code >= 32601 && code <= 32660)
    return `+proj=utm +zone=${code - 32600} +datum=WGS84 +units=m +no_defs`;
  if (code >= 32701 && code <= 32760)
    return `+proj=utm +zone=${code - 32700} +south +datum=WGS84 +units=m +no_defs`;
  if (code >= 26901 && code <= 26923)
    return `+proj=utm +zone=${code - 26900} +datum=NAD83 +units=m +no_defs`;
  return null;
}

/** A dataset is displayable on the WGS84 map only with a known CRS + transform. */
export function isGeoreferenced(dataset: RsalDataset): boolean {
  return !!dataset.transform && !!projectionDef(dataset.crs);
}

export function toWgs84(dataset: RsalDataset, x: number, y: number): [number, number] | null {
  const def = projectionDef(dataset.crs);
  if (!def) return null;
  try {
    const [lng, lat] = proj4(def, 'EPSG:4326', [x, y]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  } catch {
    return null;
  }
}

export function fromWgs84(dataset: RsalDataset, lng: number, lat: number): [number, number] | null {
  const def = projectionDef(dataset.crs);
  if (!def) return null;
  try {
    const [x, y] = proj4('EPSG:4326', def, [lng, lat]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  } catch {
    return null;
  }
}

/** WGS84 [west, south, east, north] for the map, or null for pixel-space scenes. */
export function datasetBounds(dataset: RsalDataset): Bounds | null {
  if (!isGeoreferenced(dataset)) return null;
  const t = dataset.transform!;
  const corners: [number, number][] = [
    applyAffine(t, 0, 0),
    applyAffine(t, dataset.width, 0),
    applyAffine(t, 0, dataset.height),
    applyAffine(t, dataset.width, dataset.height),
  ];
  const projected = corners.map(([x, y]) => toWgs84(dataset, x, y));
  if (projected.some((p) => p === null)) return null;
  const pts = projected as [number, number][];
  return [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ];
}

/** GDAL-style affine [a, b, c, d, e, f]: x = a*col + b*row + c. */
export function applyAffine(t: number[], col: number, row: number): [number, number] {
  return [t[0] * col + t[1] * row + t[2], t[3] * col + t[4] * row + t[5]];
}

export function invertAffine(t: number[], x: number, y: number): [number, number] {
  const det = t[0] * t[4] - t[1] * t[3];
  if (!det) return [x, y];
  const dx = x - t[2],
    dy = y - t[5];
  return [(t[4] * dx - t[1] * dy) / det, (-t[3] * dx + t[0] * dy) / det];
}

/**
 * Pixel coordinates -> display coordinates.
 * Georeferenced: WGS84 lng/lat. Pixel-space: x stays lng, lat flips (height - y)
 * so Leaflet CRS.Simple shows the raster the right way up.
 */
export function pixelToDisplay(
  dataset: RsalDataset,
  x: number,
  y: number,
): { lng: number; lat: number } {
  if (isGeoreferenced(dataset)) {
    const [mx, my] = applyAffine(dataset.transform!, x, y);
    const wgs = toWgs84(dataset, mx, my);
    if (wgs) return { lng: wgs[0], lat: wgs[1] };
  }
  return { lng: x, lat: dataset.height - y };
}

/** Display-space rectangle [w, s, e, n] for a pixel bbox. */
export function pixelRectToDisplay(
  dataset: RsalDataset,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Bounds {
  const a = pixelToDisplay(dataset, x0, y0);
  const b = pixelToDisplay(dataset, x1, y1);
  return [
    Math.min(a.lng, b.lng),
    Math.min(a.lat, b.lat),
    Math.max(a.lng, b.lng),
    Math.max(a.lat, b.lat),
  ];
}

/** Convert a stored RSAL label geometry into display-space geometry + center. */
export function labelToDisplay(
  dataset: RsalDataset | undefined,
  geometry: { type: string; coordinates: unknown },
  space: string,
): { lat: number; lng: number; geometry: SampleGeometry } | null {
  const toXY = (pair: number[]): [number, number] | null => {
    if (!dataset) return null;
    let x = pair[0],
      y = pair[1];
    if (space === 'pixel' && dataset.transform) [x, y] = applyAffine(dataset.transform, x, y);
    if (space === 'pixel' || dataset.transform) {
      // x/y are now map-CRS coordinates (or raw pixels when no transform).
      if (dataset.transform) {
        const wgs = toWgs84(dataset, x, y);
        if (wgs) return [wgs[0], wgs[1]];
        // Unknown CRS: fall back to pixel space.
        const [col, row] =
          space === 'pixel' ? pair : invertAffine(dataset.transform, pair[0], pair[1]);
        return [col, dataset.height - row];
      }
    }
    return [x, dataset.height - y];
  };
  if (geometry.type === 'Point') {
    const coords = geometry.coordinates as number[];
    const xy = toXY([Number(coords[0]), Number(coords[1])]);
    if (!xy) return null;
    return {
      lng: xy[0],
      lat: xy[1],
      geometry: { type: 'Point', coordinates: xy },
    };
  }
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][];
    const converted = rings.map((ring) =>
      ring.map((pair) => toXY([Number(pair[0]), Number(pair[1])])).filter((p) => p !== null),
    ) as number[][][];
    const ring = converted[0];
    if (!ring?.length) return null;
    return {
      lng: ring.reduce((a, p) => a + p[0], 0) / ring.length,
      lat: ring.reduce((a, p) => a + p[1], 0) / ring.length,
      geometry: { type: 'Polygon', coordinates: converted },
    };
  }
  return null;
}
