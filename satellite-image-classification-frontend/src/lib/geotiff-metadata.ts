import type { Bounds, UploadMetadata } from "@/types";

export interface ParsedUpload {
  metadata: UploadMetadata;
  source: "geotiff" | "estimated";
  note?: string;
}

const MAX_PARSE_BYTES = 120 * 1024 * 1024;

const DEFAULT_BANDS = [
  "B02 (Blue)",
  "B03 (Green)",
  "B04 (Red)",
  "B08 (NIR)",
  "B11 (SWIR1)",
  "B12 (SWIR2)",
];

function estimateMetadata(file: File, bounds: Bounds): ParsedUpload {
  const sizeMb = file.size / (1024 * 1024);
  return {
    source: "estimated",
    note:
      sizeMb > 120
        ? "File is large — metadata estimated client-side and will be verified by the ingest worker."
        : "GeoTIFF tags were not readable; metadata estimated from the project footprint.",
    metadata: {
      name: file.name.replace(/\.(tif|tiff)$/i, ""),
      bandCount: 6,
      width: 10980,
      height: 10980,
      crs: "EPSG:32611",
      resolutionM: 10,
      bands: DEFAULT_BANDS,
      bounds,
    },
  };
}

/**
 * Reads real GeoTIFF tags in the browser (band count, shape, CRS, pixel size)
 * and falls back to an estimated footprint when the file cannot be parsed.
 */
export async function buildUploadMetadata(file: File, fallbackBounds: Bounds): Promise<ParsedUpload> {
  if (file.size > MAX_PARSE_BYTES) {
    return estimateMetadata(file, fallbackBounds);
  }

  try {
    const buffer = await file.arrayBuffer();
    const { fromArrayBuffer } = await import("geotiff");
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const bandCount = image.getSamplesPerPixel() || 1;

    const geoKeys = (image.getGeoKeys() ?? {}) as Record<string, number>;
    const epsg =
      geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey ?? geoKeys.GTModelTypeGeoKey;
    const crs = epsg ? `EPSG:${epsg}` : "EPSG:4326";

    let resolutionM = 10;
    try {
      const resolution = image.getResolution();
      const candidate = Array.isArray(resolution) ? Math.abs(resolution[0]) : 10;
      const isDegrees = crs === "EPSG:4326" || crs === "EPSG:4326 ";
      resolutionM = isDegrees ? candidate * 111_320 : candidate;
      if (!Number.isFinite(resolutionM) || resolutionM <= 0) resolutionM = 10;
    } catch {
      resolutionM = 10;
    }

    let bounds = fallbackBounds;
    try {
      const bbox = image.getBoundingBox();
      if (Array.isArray(bbox) && bbox.length === 4) {
        const [minX, minY, maxX, maxY] = bbox as [number, number, number, number];
        const looksGeographic =
          Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90;
        const geographicCrs = crs === "EPSG:4326" || crs.startsWith("EPSG:4326");
        if (looksGeographic && geographicCrs) {
          bounds = { west: minX, south: minY, east: maxX, north: maxY };
        }
      }
    } catch {
      bounds = fallbackBounds;
    }

    const fileDirectory = image.getFileDirectory() as unknown as Record<string, unknown>;
    const imageDescription =
      typeof fileDirectory.ImageDescription === "string" ? fileDirectory.ImageDescription : "";
    const bandNames = DEFAULT_BANDS.slice(0, bandCount);
    if (imageDescription) bandNames[0] = imageDescription.slice(0, 40);

    return {
      source: "geotiff",
      metadata: {
        name: file.name.replace(/\.(tif|tiff)$/i, ""),
        bandCount,
        width,
        height,
        crs,
        resolutionM: Number(resolutionM.toFixed(3)),
        bands: Array.from({ length: bandCount }, (_, index) => bandNames[index] ?? `Band ${index + 1}`),
        bounds,
      },
    };
  } catch {
    return estimateMetadata(file, fallbackBounds);
  }
}
