'use client';
import { useMemo, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { BitmapLayer } from '@deck.gl/layers';
import { DEMO_BOUNDS } from '@/lib/demo';
import type { Dataset } from '@/types';
export default function DeckPreview({ dataset }: { dataset: Dataset }) {
  const [error, setError] = useState(false);
  const bounds = dataset.bounds ?? DEMO_BOUNDS;
  const layers = useMemo(
    () => [
      new BitmapLayer({
        id: 'geotiff-raster',
        image: dataset.previewUrl ?? dataset.url,
        bounds,
        opacity: 1,
        pickable: true,
      }),
    ],
    [dataset, bounds],
  );
  if (error)
    return (
      <div className="webgl-fallback">
        <img src={dataset.previewUrl ?? dataset.url} alt={`${dataset.name} raster preview`} />
        <p>WebGL is unavailable. Showing the 2D raster preview.</p>
      </div>
    );
  return (
    <div className="deck-preview">
      <DeckGL
        initialViewState={{
          longitude: (bounds[0] + bounds[2]) / 2,
          latitude: (bounds[1] + bounds[3]) / 2,
          zoom: 11,
          pitch: 30,
          bearing: 0,
        }}
        controller
        layers={layers}
        onError={() => setError(true)}
        getTooltip={({ coordinate }) =>
          coordinate ? `${coordinate[1].toFixed(5)}°, ${coordinate[0].toFixed(5)}°` : null
        }
      />
      <span className="deck-hint">Drag to pan · scroll to zoom · Shift + drag to tilt</span>
    </div>
  );
}
