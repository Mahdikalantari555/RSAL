'use client';
import { useQuery } from '@tanstack/react-query';
import { renderRaster } from '@/lib/geotiff';
import type { Dataset } from '@/types';

/** True-color PNG data URL rendered in the browser from the original GeoTIFF. */
export function useRasterPreview(dataset: Dataset | null | undefined) {
  return useQuery({
    queryKey: ['raster-preview', dataset?.id],
    queryFn: async () => {
      const response = await fetch(dataset!.url);
      if (!response.ok) throw new Error('The raster could not be loaded.');
      return renderRaster(await response.arrayBuffer());
    },
    enabled: !!dataset,
    staleTime: Infinity,
    retry: 0,
  });
}
