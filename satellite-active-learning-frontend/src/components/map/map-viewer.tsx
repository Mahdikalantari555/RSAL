'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Crosshair,
  FileImage,
  Hand,
  Layers,
  LoaderCircle,
  MapPin,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Scan,
  Settings2,
  Shrink,
  Square,
  Undo2,
  VectorSquare,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/stores/workspace';
import { renderRaster } from '@/lib/geotiff';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dot, EmptyState } from '@/components/ui/common';
import type { BandMode, Dataset, DrawingTool, Project, Sample, SampleGeometry } from '@/types';
import type { MapAction } from './leaflet-map';
const LeafletMap = dynamic(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" size={25} />
      <span>Finding your perspective…</span>
    </div>
  ),
});
const tools: { id: DrawingTool; icon: typeof Hand; title: string }[] = [
  { id: 'pan', icon: Hand, title: 'Pan map' },
  { id: 'point', icon: MapPin, title: 'Draw point (P)' },
  { id: 'polygon', icon: VectorSquare, title: 'Draw polygon — double-click to finish' },
  { id: 'rectangle', icon: Square, title: 'Draw rectangle — click two corners' },
];
export function MapViewer({
  project,
  datasets,
  samples,
  busy = false,
}: {
  project: Project;
  datasets: Dataset[];
  samples: Sample[];
  busy?: boolean;
}) {
  const store = useWorkspace();
  const {
    selectedDatasetId,
    selectDataset,
    tool,
    setTool,
    activeClass,
    setActiveClass,
    bandMode,
    setBandMode,
    customBands,
    setCustomBands,
    opacity,
    setOpacity,
    showLabels,
    toggleLabels,
    showSuggestions,
    toggleSuggestions,
    drafts,
    saveDraft,
    removeDraft,
  } = store;
  const dataset = datasets.find((d) => d.id === selectedDatasetId) ?? datasets[0];
  const [expanded, setExpanded] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [bandsOpen, setBandsOpen] = useState(false);
  const [action, setAction] = useState<MapAction | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const command = (kind: MapAction['kind']) => setAction({ kind, nonce: Date.now() });
  const raster = useQuery({
    queryKey: ['raster', dataset?.id, bandMode, customBands],
    queryFn: async () => {
      if (dataset.demo) return dataset.url;
      if (bandMode === 'true-color' && dataset.previewUrl) return dataset.previewUrl;
      const response = await fetch(dataset.url);
      if (!response.ok) throw new Error('The raster could not be loaded.');
      return renderRaster(await response.arrayBuffer(), bandMode, customBands);
    },
    enabled: !!dataset,
    staleTime: Infinity,
    retry: 0,
  });
  useEffect(() => {
    if (raster.error) toast.error(raster.error.message);
  }, [raster.error]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const onDraw = (lat: number, lng: number, geometry: SampleGeometry) => {
    if (busy) {
      toast.info('Please wait until the current submission finishes.');
      return;
    }
    const label = project.classes.find((c) => c.id === activeClass) ?? project.classes[0];
    saveDraft({
      sampleId: `manual-${crypto.randomUUID()}`,
      label: label.id,
      status: 'labeled',
      note: '',
      lat,
      lng,
      geometry,
    });
    toast.success(`${label.name} sample added`, {
      description: 'Submit your labels to save this training sample.',
    });
  };
  const changeBands = (mode: BandMode) => {
    if (mode === 'ndvi' && dataset?.demo) {
      toast.info('NDVI needs a real multispectral GeoTIFF.', {
        description:
          'Upload imagery with red and near-infrared bands to calculate vegetation indices.',
      });
      return;
    }
    if (mode === 'false-color' && dataset?.demo)
      toast.info('Illustrative false-color preview', {
        description: 'Upload a multispectral GeoTIFF for real infrared band combinations.',
      });
    setBandMode(mode);
    setBandsOpen(mode === 'custom');
  };
  if (!dataset)
    return (
      <div className="map-card map-empty">
        <EmptyState
          title="Your next discovery starts with a scene"
          description="Upload a GeoTIFF to explore its spectral bands and create your first training samples."
          action={
            <Button onClick={() => store.setView('datasets')}>
              <Plus size={16} />
              Add imagery
            </Button>
          }
        />
      </div>
    );
  const selected = samples.find((s) => s.id === store.selectedSampleId);
  const rasterUrl = raster.data ?? dataset.previewUrl ?? dataset.url;
  return (
    <div className={cn('map-card', expanded && 'is-expanded')} ref={cardRef}>
      <div className="map-card-header">
        <span className="dataset-file-icon">
          <FileImage size={17} />
        </span>
        <div className="map-dataset-select">
          <select
            aria-label="Active satellite dataset"
            value={dataset.id}
            onChange={(e) => selectDataset(e.target.value)}
          >
            {datasets.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span>
            {dataset.demo ? 'Sentinel-2 · Sacramento Valley' : 'GeoTIFF · ' + dataset.crs}
          </span>
        </div>
        <span className="raster-ready">
          <span />
          Ready
        </span>
        <button
          className="icon-button"
          aria-label={expanded ? 'Exit expanded map' : 'Expand map'}
          title="Expand map"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Shrink size={17} /> : <Maximize size={17} />}
        </button>
      </div>
      <div className="map-canvas-wrap">
        {rasterUrl && (
          <LeafletMap
            dataset={dataset}
            rasterUrl={rasterUrl}
            project={project}
            samples={samples}
            action={action}
            onDraw={onDraw}
          />
        )}
        {raster.isFetching && (
          <div className="raster-loading">
            <LoaderCircle className="spin" size={15} />
            Rendering spectral bands…
          </div>
        )}
        <div className="map-top-left">
          <div className="band-selector">
            <span className="rgb-icon">
              <i />
              <i />
              <i />
            </span>
            <select
              value={bandMode}
              onChange={(e) => changeBands(e.target.value as BandMode)}
              aria-label="Band combination"
            >
              <option value="true-color">True color (RGB)</option>
              <option value="false-color">False color (NIR)</option>
              <option value="ndvi">NDVI vegetation</option>
              <option value="custom">Custom RGB</option>
            </select>
          </div>
          {bandMode === 'custom' && (
            <button
              className="map-float-button"
              onClick={() => setBandsOpen(!bandsOpen)}
              aria-label="Configure RGB bands"
            >
              <Settings2 size={17} />
            </button>
          )}
        </div>
        {bandsOpen && (
          <div className="custom-bands floating-panel">
            <div className="floating-title">
              <strong>Custom RGB bands</strong>
              <button
                onClick={() => setBandsOpen(false)}
                className="icon-button"
                aria-label="Close band configuration"
              >
                <X size={14} />
              </button>
            </div>
            {['Red', 'Green', 'Blue'].map((name, i) => (
              <label key={name}>
                {name}
                <select
                  className="input"
                  value={Math.min(customBands[i], dataset.bands - 1)}
                  onChange={(e) => {
                    const next = [...customBands] as [number, number, number];
                    next[i] = Number(e.target.value);
                    setCustomBands(next);
                  }}
                >
                  {Array.from({ length: dataset.bands }, (_, b) => (
                    <option value={b} key={b}>
                      Band {b + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {dataset.demo && <p>Illustrative RGB image. Upload a GeoTIFF to apply custom bands.</p>}
          </div>
        )}
        <div className="draw-toolbar">
          {tools.map(({ id, icon: Icon, title }) => (
            <button
              key={id}
              className={cn(tool === id && 'selected')}
              title={title}
              aria-label={title}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            >
              <Icon size={18} strokeWidth={1.7} />
            </button>
          ))}
          <span />
          <button
            aria-label="Undo last drawn sample"
            title="Undo last drawn sample"
            onClick={() => {
              const last = Object.keys(drafts)
                .filter((id) => id.startsWith('manual-'))
                .pop();
              if (last) {
                removeDraft(last);
                toast.success('Last drawn sample removed.');
              }
              command('undo');
            }}
          >
            <Undo2 size={18} />
          </button>
        </div>
        <div className="map-top-right">
          <button
            className={cn('map-float-button', layersOpen && 'selected')}
            onClick={() => setLayersOpen(!layersOpen)}
            title="Map layers and opacity"
            aria-label="Map layers and opacity"
          >
            <Layers size={18} />
          </button>
          <button
            className="map-float-button"
            onClick={() => command('fit')}
            title="Fit dataset to view"
            aria-label="Fit dataset to view"
          >
            <Scan size={18} />
          </button>
        </div>
        {layersOpen && (
          <div className="layer-panel floating-panel">
            <div className="floating-title">
              <strong>Map layers</strong>
              <button
                className="icon-button"
                onClick={() => setLayersOpen(false)}
                aria-label="Close layers"
              >
                <X size={14} />
              </button>
            </div>
            <label>
              <input type="checkbox" checked={showSuggestions} onChange={toggleSuggestions} />
              <span>Model suggestions</span>
              <Dot color="#cfb96d" />
            </label>
            <label>
              <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
              <span>Labeled samples</span>
              <Dot color="#3f9c70" />
            </label>
            <div className="opacity-label">
              <span>Raster opacity</span>
              <strong>{opacity}%</strong>
            </div>
            <input
              aria-label="Raster opacity"
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </div>
        )}
        {tool !== 'pan' && (
          <div className="drawing-hint">
            <MousePointer2 size={13} />
            {tool === 'point'
              ? 'Click to add a labeled point'
              : tool === 'rectangle'
                ? 'Click two opposite corners'
                : 'Click to add vertices · double-click to finish'}
          </div>
        )}
        <div className="map-bottom-left">
          <div className="map-suggestion-badge">
            <span className="suggestion-ring" />
            Model suggestions<span>{samples.filter((s) => s.status === 'pending').length}</span>
          </div>
          <span className="map-coordinate">
            {(selected?.lat ?? 38.515).toFixed(4)}° N &nbsp;{' '}
            {Math.abs(selected?.lng ?? -121.67).toFixed(4)}° W
          </span>
        </div>
        <div className="map-zoom-controls">
          <button onClick={() => command('in')} title="Zoom in" aria-label="Zoom in">
            <Plus size={19} />
          </button>
          <button onClick={() => command('out')} title="Zoom out" aria-label="Zoom out">
            <Minus size={19} />
          </button>
          <button
            onClick={() => command('focus')}
            title="Locate selected sample"
            aria-label="Locate selected sample"
          >
            <Crosshair size={18} />
          </button>
        </div>
        <div className="map-attribution">
          {dataset.demo ? 'Illustrative demo imagery' : <>Basemap © Esri · Uploaded imagery</>}
        </div>
      </div>
      <div className="class-legend">
        <span className="legend-heading">CLASSES</span>
        <div>
          {project.classes.map((c, i) => (
            <button
              className={cn(activeClass === c.id && 'active')}
              key={c.id}
              onClick={() => setActiveClass(c.id)}
              title={`Draw ${c.name} samples · ${i + 1}`}
            >
              <Dot color={c.color} />
              {c.name}
            </button>
          ))}
        </div>
        <span className="legend-count">{project.classes.length} classes</span>
      </div>
      <div className="map-metadata">
        <span>
          <span className="online-dot" /> {dataset.demo ? 'Sentinel-2 L2A' : 'GeoTIFF'}
          <i /> {dataset.resolution} resolution
          <i />
          {dataset.crs}
        </span>
        <span>
          <Layers size={12} />
          {dataset.bands} bands
        </span>
      </div>
    </div>
  );
}
