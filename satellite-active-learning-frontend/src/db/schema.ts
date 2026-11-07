import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { Bounds, ClassDefinition, SampleGeometry } from '@/types';
export const projects = pgTable('terra_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('unlabeled'),
  classes: jsonb('classes').$type<ClassDefinition[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  iteration: integer('iteration').notNull().default(1),
  accuracy: real('accuracy').notNull().default(0),
  f1: real('f1').notNull().default(0),
  labeledCount: integer('labeled_count').notNull().default(0),
  totalSamples: integer('total_samples').notNull().default(0),
  modelVersion: text('model_version').notNull().default('Not trained'),
  demo: boolean('demo').notNull().default(false),
});
export const datasets = pgTable(
  'terra_datasets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    size: integer('size').notNull(),
    bands: integer('bands').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    resolution: text('resolution').notNull(),
    crs: text('crs').notNull(),
    bounds: jsonb('bounds').$type<Bounds | null>(),
    url: text('url').notNull(),
    previewUrl: text('preview_url'),
    demo: boolean('demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('terra_dataset_project_idx').on(t.projectId)],
);
export const samples = pgTable(
  'terra_samples',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    prediction: text('prediction').notNull(),
    confidence: real('confidence').notNull(),
    uncertainty: real('uncertainty').notNull(),
    status: text('status').notNull().default('pending'),
    label: text('label'),
    note: text('note').notNull().default(''),
    iteration: integer('iteration').notNull(),
    batchIndex: integer('batch_index').notNull(),
    geometry: jsonb('geometry').$type<SampleGeometry | null>(),
    source: text('source').notNull().default('query'),
  },
  (t) => [index('terra_sample_project_idx').on(t.projectId)],
);
export const iterations = pgTable(
  'terra_iterations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    accuracy: real('accuracy').notNull(),
    f1: real('f1').notNull(),
    sampleCount: integer('sample_count').notNull(),
    labeledCount: integer('labeled_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('terra_iteration_project_idx').on(t.projectId)],
);
