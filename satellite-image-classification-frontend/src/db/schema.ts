import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AreaOfInterest,
  Bounds,
  ClassMetric,
  ConfusionMatrix,
  ClassDefinition,
  ProjectStatus,
  SampleGeometry,
  SampleStatus,
  SuggestionStatus,
  LabelSource,
} from "@/types";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  numClasses: integer("num_classes").notNull().default(4),
  classes: jsonb("classes").$type<ClassDefinition[]>().notNull(),
  status: text("status").$type<ProjectStatus>().notNull().default("unlabeled"),
  aoi: jsonb("aoi").$type<AreaOfInterest>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  bandCount: integer("band_count").notNull().default(4),
  width: integer("width").notNull().default(1024),
  height: integer("height").notNull().default(1024),
  crs: text("crs").notNull().default("EPSG:4326"),
  resolutionM: doublePrecision("resolution_m").notNull().default(10),
  bounds: jsonb("bounds").$type<Bounds>().notNull(),
  bands: jsonb("bands").$type<string[]>().notNull().default([]),
  status: text("status").$type<"ready" | "processing">().notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const samples = pgTable("samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  geometry: jsonb("geometry").$type<SampleGeometry>().notNull(),
  classId: text("class_id").notNull(),
  source: text("source").$type<LabelSource>().notNull().default("human"),
  confidence: real("confidence"),
  note: text("note"),
  status: text("status").$type<SampleStatus>().notNull().default("labeled"),
  iteration: integer("iteration").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  iteration: integer("iteration").notNull().default(0),
  size: integer("size").notNull().default(0),
  labeledCount: integer("labeled_count").notNull().default(0),
  status: text("status").$type<"pending" | "submitted">().notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  predictedClassId: text("predicted_class_id").notNull(),
  confidence: real("confidence").notNull(),
  uncertainty: real("uncertainty").notNull(),
  status: text("status").$type<SuggestionStatus>().notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const iterations = pgTable("iterations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  iteration: integer("iteration").notNull().default(1),
  accuracy: real("accuracy").notNull(),
  f1: real("f1").notNull(),
  kappa: real("kappa").notNull(),
  precision: real("precision").notNull(),
  recall: real("recall").notNull(),
  labeledSamples: integer("labeled_samples").notNull().default(0),
  newLabels: integer("new_labels").notNull().default(0),
  trainSeconds: doublePrecision("train_seconds").notNull().default(0),
  confusionMatrix: jsonb("confusion_matrix").$type<ConfusionMatrix>().notNull(),
  classMetrics: jsonb("class_metrics").$type<ClassMetric[]>().notNull(),
  confidenceHistogram: jsonb("confidence_histogram").$type<number[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type SceneRow = typeof scenes.$inferSelect;
export type SampleRow = typeof samples.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type SuggestionRow = typeof suggestions.$inferSelect;
export type IterationRow = typeof iterations.$inferSelect;
