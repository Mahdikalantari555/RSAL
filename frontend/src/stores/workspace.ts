'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BandMode, DrawingTool, LabelInput, WorkspaceView } from '@/types';
interface WorkspaceState {
  view: WorkspaceView;
  projectId: string;
  selectedSampleId: string | null;
  selectedDatasetId: string | null;
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  tool: DrawingTool;
  activeClass: string;
  bandMode: BandMode;
  customBands: [number, number, number];
  opacity: number;
  showLabels: boolean;
  showSuggestions: boolean;
  drafts: Record<string, LabelInput>;
  mobileReview: boolean;
  setView: (view: WorkspaceView) => void;
  setProject: (id: string) => void;
  selectSample: (id: string | null) => void;
  selectDataset: (id: string | null) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTool: (tool: DrawingTool) => void;
  setActiveClass: (id: string) => void;
  setBandMode: (mode: BandMode) => void;
  setCustomBands: (bands: [number, number, number]) => void;
  setOpacity: (opacity: number) => void;
  toggleLabels: () => void;
  toggleSuggestions: () => void;
  saveDraft: (draft: LabelInput) => void;
  removeDraft: (id: string) => void;
  clearDrafts: () => void;
}
export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      view: 'learning',
      projectId: '',
      selectedSampleId: null,
      selectedDatasetId: null,
      theme: 'light',
      sidebarOpen: false,
      tool: 'pan',
      activeClass: '',
      bandMode: 'true-color',
      customBands: [3, 2, 1],
      opacity: 100,
      showLabels: true,
      showSuggestions: true,
      drafts: {},
      mobileReview: false,
      setView: (view) => set({ view, sidebarOpen: false }),
      setProject: (projectId) =>
        set({
          projectId,
          selectedSampleId: null,
          selectedDatasetId: null,
          drafts: {},
          view: 'learning',
          bandMode: 'true-color',
          sidebarOpen: false,
        }),
      selectSample: (selectedSampleId) => set({ selectedSampleId }),
      selectDataset: (selectedDatasetId) => set({ selectedDatasetId, bandMode: 'true-color' }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setTool: (tool) => set({ tool }),
      setActiveClass: (activeClass) => set({ activeClass }),
      setBandMode: (bandMode) => set({ bandMode }),
      setCustomBands: (customBands) => set({ customBands }),
      setOpacity: (opacity) => set({ opacity }),
      toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
      toggleSuggestions: () => set((s) => ({ showSuggestions: !s.showSuggestions })),
      saveDraft: (draft) => set((s) => ({ drafts: { ...s.drafts, [draft.sampleId]: draft } })),
      removeDraft: (id) =>
        set((s) => ({
          drafts: Object.fromEntries(Object.entries(s.drafts).filter(([key]) => key !== id)),
        })),
      clearDrafts: () => set({ drafts: {} }),
    }),
    {
      name: 'terralab-workspace-v2',
      partialize: (s) => ({ theme: s.theme, projectId: s.projectId, drafts: s.drafts }),
    },
  ),
);
