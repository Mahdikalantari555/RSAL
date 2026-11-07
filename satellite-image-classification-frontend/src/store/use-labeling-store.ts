"use client";

import { create } from "zustand";
import type { ClassDefinition, Suggestion, SuggestionStatus } from "@/types";

export type DraftStatus = "pending" | "accepted" | "overridden" | "skipped";

export interface DraftEntry {
  status: DraftStatus;
  classId: string;
  predictedClassId: string;
  note: string;
}

interface LabelingState {
  batchId: string | null;
  drafts: Record<string, DraftEntry>;
  cursor: number;
  initialize: (batchId: string | null, suggestions: Suggestion[], force?: boolean) => void;
  setStatus: (suggestionId: string, status: DraftStatus) => void;
  assignClass: (suggestionId: string, classId: string) => void;
  setNote: (suggestionId: string, note: string) => void;
  setCursor: (index: number) => void;
  step: (delta: number, total: number) => void;
  reset: () => void;
  counts: () => { pending: number; handled: number; total: number };
  toPayload: () => {
    suggestionId: string;
    status: Exclude<SuggestionStatus, "pending">;
    classId: string;
    note: string;
  }[];
}

export const useLabelingStore = create<LabelingState>((set, get) => ({
  batchId: null,
  drafts: {},
  cursor: 0,
  initialize: (batchId, suggestions, force = false) => {
    if (!force && get().batchId === batchId) return;
    const drafts: Record<string, DraftEntry> = {};
    for (const suggestion of suggestions) {
      drafts[suggestion.id] = {
        status: suggestion.status === "pending" ? "pending" : suggestion.status,
        classId: suggestion.predictedClassId,
        predictedClassId: suggestion.predictedClassId,
        note: suggestion.note ?? "",
      };
    }
    set({ batchId, drafts, cursor: 0 });
  },
  setStatus: (suggestionId, status) =>
    set((state) => {
      const entry = state.drafts[suggestionId];
      if (!entry) return state;
      return {
        drafts: {
          ...state.drafts,
          [suggestionId]: {
            ...entry,
            status,
            classId: status === "accepted" ? entry.predictedClassId : entry.classId,
          },
        },
      };
    }),
  assignClass: (suggestionId, classId) =>
    set((state) => {
      const entry = state.drafts[suggestionId];
      if (!entry) return state;
      return {
        drafts: {
          ...state.drafts,
          [suggestionId]: {
            ...entry,
            classId,
            status: classId === entry.predictedClassId ? "accepted" : "overridden",
          },
        },
      };
    }),
  setNote: (suggestionId, note) =>
    set((state) => {
      const entry = state.drafts[suggestionId];
      if (!entry) return state;
      return { drafts: { ...state.drafts, [suggestionId]: { ...entry, note } } };
    }),
  setCursor: (cursor) => set({ cursor }),
  step: (delta, total) =>
    set((state) => ({
      cursor: Math.min(Math.max(state.cursor + delta, 0), Math.max(total - 1, 0)),
    })),
  reset: () => set({ batchId: null, drafts: {}, cursor: 0 }),
  counts: () => {
    const entries = Object.values(get().drafts);
    return {
      pending: entries.filter((entry) => entry.status === "pending").length,
      handled: entries.filter((entry) => entry.status !== "pending").length,
      total: entries.length,
    };
  },
  toPayload: () =>
    Object.entries(get().drafts)
      .filter(([, entry]) => entry.status !== "pending")
      .map(([suggestionId, entry]) => ({
        suggestionId,
        status: entry.status as Exclude<SuggestionStatus, "pending">,
        classId: entry.classId,
        note: entry.note,
      })),
}));

export function resolveDraftClass(entry: DraftEntry | undefined, classes: ClassDefinition[]): string {
  if (!entry) return classes[0]?.id ?? "";
  return entry.classId;
}
