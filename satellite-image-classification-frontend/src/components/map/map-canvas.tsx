"use client";

import * as React from "react";
import type * as Leaflet from "leaflet";
import { generateRasterDataUrl } from "@/lib/raster";
import { classNameFor } from "@/components/map/map-helpers";
import type {
  AreaOfInterest,
  BandPresetId,
  DataScene,
  DrawingTool,
  LabelledSample,
  Project,
  SampleGeometry,
  Suggestion,
} from "@/types";

export interface MapCanvasProps {
  project: Project;
  scenes: DataScene[];
  samples: LabelledSample[];
  suggestions: Suggestion[];
  activeSceneId: string | null;
  bandPreset: BandPresetId;
  customBands?: [number, number, number];
  opacity: number;
  showRaster: boolean;
  showLabels: boolean;
  showSuggestions: boolean;
  tool: DrawingTool;
  activeClassId: string | null;
  selectedSuggestionId: string | null;
  onSelectSuggestion?: (id: string) => void;
  onCreateSample?: (geometry: SampleGeometry) => void;
}

const IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function MapCanvas({
  project,
  scenes,
  samples,
  suggestions,
  activeSceneId,
  bandPreset,
  customBands = [2, 1, 0],
  opacity,
  showRaster,
  showLabels,
  showSuggestions,
  tool,
  activeClassId,
  selectedSuggestionId,
  onSelectSuggestion,
  onCreateSample,
}: MapCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<Leaflet.Map | null>(null);
  const leafletRef = React.useRef<typeof Leaflet | null>(null);
  const rasterRef = React.useRef<Leaflet.ImageOverlay | null>(null);
  const labelsRef = React.useRef<Leaflet.LayerGroup | null>(null);
  const suggestionsRef = React.useRef<Leaflet.LayerGroup | null>(null);
  const drawRef = React.useRef<Leaflet.LayerGroup | null>(null);
  const drawPointsRef = React.useRef<[number, number][]>([]);
  const [ready, setReady] = React.useState(false);

  const callbacks = React.useRef({ onSelectSuggestion, onCreateSample, activeClassId, project });
  callbacks.current = { onSelectSuggestion, onCreateSample, activeClassId, project };

  const activeScene = React.useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0] ?? null,
    [scenes, activeSceneId],
  );

  /* ---------------------------------------------------------------- mount */
  React.useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | null = null;

    async function boot() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      leafletRef.current = L;

      const aoi: AreaOfInterest = project.aoi;
      map = L.map(containerRef.current, {
        center: aoi.center,
        zoom: aoi.zoom,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      });

      L.tileLayer(IMAGERY_URL, {
        maxZoom: 19,
        attribution: "&copy; Esri · Maxar · Earthstar Geographics",
      }).addTo(map);

      labelsRef.current = L.layerGroup().addTo(map);
      suggestionsRef.current = L.layerGroup().addTo(map);
      drawRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);

      const bounds = L.latLngBounds(
        [aoi.bounds.south, aoi.bounds.west],
        [aoi.bounds.north, aoi.bounds.east],
      );
      map.fitBounds(bounds, { padding: [12, 12] });
    }

    void boot();

    return () => {
      disposed = true;
      if (map) map.remove();
      mapRef.current = null;
      labelsRef.current = null;
      suggestionsRef.current = null;
      drawRef.current = null;
      rasterRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------- raster overlay */
  const rasterUrl = React.useMemo(() => {
    if (!activeScene || !ready) return "";
    return generateRasterDataUrl(
      `${activeScene.id}:${bandPreset}`,
      bandPreset,
      300,
      210,
      customBands,
    );
  }, [activeScene, bandPreset, ready, customBands]);

  React.useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (rasterRef.current) {
      map.removeLayer(rasterRef.current);
      rasterRef.current = null;
    }
    if (!activeScene || !showRaster || !rasterUrl) return;

    const overlay = L.imageOverlay(
      rasterUrl,
      [
        [activeScene.bounds.south, activeScene.bounds.west],
        [activeScene.bounds.north, activeScene.bounds.east],
      ],
      { opacity, interactive: false, className: "scene-raster" },
    );
    overlay.addTo(map);
    rasterRef.current = overlay;
  }, [activeScene, rasterUrl, opacity, showRaster]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeScene) return;
    map.flyToBounds(
      [
        [activeScene.bounds.south, activeScene.bounds.west],
        [activeScene.bounds.north, activeScene.bounds.east],
      ],
      { padding: [16, 16], duration: 0.6 },
    );
  }, [activeScene]);

  /* ------------------------------------------------------------- samples */
  React.useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const group = labelsRef.current;
    if (!map || !L || !group) return;
    group.clearLayers();
    if (!showLabels) return;

    const classes = project.classes;
    for (const sample of samples) {
      const color = classNameFor(classes, sample.classId)?.color ?? "#94A3B8";
      const label = classNameFor(classes, sample.classId)?.name ?? "Unassigned";
      const popup = `<strong>${label}</strong><br/>${sample.source}${
        sample.confidence ? ` · ${(sample.confidence * 100).toFixed(0)}%` : ""
      }${sample.note ? `<br/><em>${sample.note}</em>` : ""}`;

      if (sample.geometry.type === "Point") {
        const [lng, lat] = sample.geometry.coordinates;
        L.circleMarker([lat, lng], {
          radius: 4.5,
          color: "#ffffff",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindPopup(popup)
          .addTo(group);
      } else {
        const ring = sample.geometry.coordinates[0] ?? [];
        const latlngs = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
        L.polygon(latlngs, {
          color,
          weight: 1.4,
          opacity: 0.95,
          fillColor: color,
          fillOpacity: 0.26,
        })
          .bindPopup(popup)
          .addTo(group);
      }
    }
  }, [samples, project.classes, showLabels, ready]);

  /* --------------------------------------------------------- suggestions */
  React.useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const group = suggestionsRef.current;
    if (!map || !L || !group) return;
    group.clearLayers();
    if (!showSuggestions) return;

    suggestions.forEach((suggestion, index) => {
      const cls = classNameFor(project.classes, suggestion.predictedClassId);
      const color = cls?.color ?? "#FB923C";
      const active = suggestion.id === selectedSuggestionId;
      const size = active ? 28 : 22;
      const icon = L.divIcon({
        className: "suggestion-marker",
        html: `<div class="suggestion-pin ${active ? "is-active" : ""}" style="width:${size}px;height:${size}px;background:${color}">${
          index + 1
        }</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      L.marker([suggestion.lat, suggestion.lng], { icon })
        .bindPopup(
          `<strong>#${index + 1} · ${cls?.name ?? "Unknown"}</strong><br/>confidence ${(
            suggestion.confidence * 100
          ).toFixed(1)}% · uncertainty ${(suggestion.uncertainty * 100).toFixed(1)}%`,
        )
        .on("click", () => callbacks.current.onSelectSuggestion?.(suggestion.id))
        .addTo(group);
    });
  }, [suggestions, project.classes, selectedSuggestionId, showSuggestions, ready]);

  /* -------------------------------------- pan to the selected suggestion */
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedSuggestionId) return;
    const suggestion = suggestions.find((item) => item.id === selectedSuggestionId);
    if (!suggestion) return;
    map.panTo([suggestion.lat, suggestion.lng], { animate: true, duration: 0.4 });
  }, [selectedSuggestionId, suggestions]);

  /* ------------------------------------------------------ drawing tools */
  React.useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const group = drawRef.current;
    if (!map || !L || !group || !ready) return;

    const container = map.getContainer();
    container.style.cursor = tool === "pan" ? "" : "crosshair";
    group.clearLayers();
    drawPointsRef.current = [];

    if (tool === "pan") return;

    const renderPreview = () => {
      group.clearLayers();
      const points = drawPointsRef.current;
      points.forEach((point) =>
        L.circleMarker(point, {
          radius: 4,
          color: "#3DDC97",
          fillColor: "#3DDC97",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(group),
      );
      if (points.length >= 2) {
        L.polyline(points, { color: "#3DDC97", weight: 2, dashArray: "5 4" }).addTo(group);
        if (tool === "polygon" && points.length >= 3) {
          L.polyline([points[points.length - 1], points[0]], {
            color: "#3DDC97",
            weight: 1,
            dashArray: "2 5",
            opacity: 0.7,
          }).addTo(group);
        }
      }
    };

    const emit = (geometry: SampleGeometry) => {
      if (!callbacks.current.activeClassId) return;
      callbacks.current.onCreateSample?.(geometry);
      group.clearLayers();
      drawPointsRef.current = [];
    };

    const handleClick = (event: Leaflet.LeafletMouseEvent) => {
      const point: [number, number] = [event.latlng.lat, event.latlng.lng];

      if (tool === "point") {
        emit({ type: "Point", coordinates: [point[1], point[0]] });
        return;
      }

      if (tool === "rectangle") {
        if (drawPointsRef.current.length === 0) {
          drawPointsRef.current = [point];
          renderPreview();
          return;
        }
        const [start] = drawPointsRef.current;
        const south = Math.min(start[0], point[0]);
        const north = Math.max(start[0], point[0]);
        const west = Math.min(start[1], point[1]);
        const east = Math.max(start[1], point[1]);
        if (north - south < 0.0003 || east - west < 0.0003) return;
        emit({
          type: "Polygon",
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        });
        return;
      }

      drawPointsRef.current = [...drawPointsRef.current, point];
      renderPreview();
    };

    const finishPolygon = () => {
      const points = drawPointsRef.current;
      if (tool !== "polygon" || points.length < 3) return;
      const ring = points.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      emit({ type: "Polygon", coordinates: [ring] });
    };

    const handleDoubleClick = (event: Leaflet.LeafletMouseEvent) => {
      if (tool !== "polygon") return;
      event.originalEvent?.preventDefault();
      finishPolygon();
    };

    const handleMove = (event: Leaflet.LeafletMouseEvent) => {
      if (tool !== "rectangle" || drawPointsRef.current.length !== 1) return;
      const [start] = drawPointsRef.current;
      const point = event.latlng;
      group.clearLayers();
      L.circleMarker(start, { radius: 4, color: "#3DDC97", fillOpacity: 0.9 }).addTo(group);
      L.rectangle(
        [
          [Math.min(start[0], point.lat), Math.min(start[1], point.lng)],
          [Math.max(start[0], point.lat), Math.max(start[1], point.lng)],
        ],
        { color: "#3DDC97", weight: 1.5, fillOpacity: 0.12, dashArray: "4 4" },
      ).addTo(group);
    };

    map.on("click", handleClick);
    map.on("dblclick", handleDoubleClick);
    map.on("mousemove", handleMove);

    return () => {
      map.off("click", handleClick);
      map.off("dblclick", handleDoubleClick);
      map.off("mousemove", handleMove);
      group.clearLayers();
      container.style.cursor = "";
    };
  }, [tool, ready]);

  return (
    <div className="relative">
      <div ref={containerRef} className="z-0 h-[clamp(380px,58vh,640px)] w-full" />
      {tool !== "pan" ? (
        <div className="pointer-events-none absolute left-1/2 top-2 z-[500] -translate-x-1/2 rounded-full border border-primary/30 bg-slate-950/85 px-3 py-1 text-[10.5px] font-medium text-primary shadow-lg backdrop-blur">
          {tool === "point" && "Click to drop a labeled point"}
          {tool === "polygon" && "Click vertices · double-click to close the polygon"}
          {tool === "rectangle" && "Click two corners to draw a bounding box"}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md border border-white/10 bg-slate-950/70 px-2 py-1 font-mono text-[9.5px] text-slate-300 backdrop-blur">
        {activeScene ? `${activeScene.name} · ${activeScene.crs} · ${activeScene.resolutionM}m` : "No scene"}
      </div>
    </div>
  );
}
