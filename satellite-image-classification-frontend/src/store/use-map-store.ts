"use client";

import { create } from "zustand";
import type { BandPresetId, ClassDefinition, DataScene, DrawingTool } from "@/types";

interface MapState {
  tool: DrawingTool;
  activeClassId: string | null;
  bandPreset: BandPresetId;
  customBands: [number, number, number];
  opacity: number;
  showRaster: boolean;
  showLabels: boolean;
  showSuggestions: boolean;
  showUncertainty: boolean;
  activeSceneId: string | null;
  selectedSuggestionId: string | null;
  setTool: (tool: DrawingTool) => void;
  setActiveClass: (classId: string | null) => void;
  setBandPreset: (preset: BandPresetId) => void;
  setCustomBand: (channel: 0 | 1 | 2, bandIndex: number) => void;
  setOpacity: (opacity: number) => void;
  toggleLayer: (layer: "raster" | "labels" | "suggestions" | "uncertainty") => void;
  setActiveScene: (sceneId: string | null) => void;
  selectSuggestion: (suggestionId: string | null) => void;
  syncWithProject: (classes: ClassDefinition[], scenes: DataScene[]) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  tool: "pan",
  activeClassId: null,
  bandPreset: "true_color",
  customBands: [2, 1, 0],
  opacity: 0.72,
  showRaster: true,
  showLabels: true,
  showSuggestions: true,
  showUncertainty: true,
  activeSceneId: null,
  selectedSuggestionId: null,
  setTool: (tool) => set({ tool }),
  setActiveClass: (activeClassId) => set({ activeClassId }),
  setBandPreset: (bandPreset) =>
    set({
      bandPreset,
      ...(bandPreset === "uncertainty" ? { showUncertainty: true } : {}),
    }),
  setCustomBand: (channel, bandIndex) =>
    set((state) => {
      const next = [...state.customBands] as [number, number, number];
      next[channel] = bandIndex;
      return { customBands: next };
    }),
  setOpacity: (opacity) => set({ opacity }),
  toggleLayer: (layer) =>
    set({
      ...(layer === "raster" ? { showRaster: !get().showRaster } : {}),
      ...(layer === "labels" ? { showLabels: !get().showLabels } : {}),
      ...(layer === "suggestions" ? { showSuggestions: !get().showSuggestions } : {}),
      ...(layer === "uncertainty" ? { showUncertainty: !get().showUncertainty } : {}),
    }),
  setActiveScene: (activeSceneId) => set({ activeSceneId }),
  selectSuggestion: (selectedSuggestionId) => set({ selectedSuggestionId }),
  syncWithProject: (classes, scenes) =>
    set({
      activeClassId: classes.some((cls) => cls.id === get().activeClassId)
        ? get().activeClassId
        : (classes[0]?.id ?? null),
      activeSceneId: scenes.some((scene) => scene.id === get().activeSceneId)
        ? get().activeSceneId
        : (scenes[0]?.id ?? null),
    }),
}));
