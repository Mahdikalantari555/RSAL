import { sql } from "drizzle-orm";
import { db } from "@/db";
import { batches, iterations, projects, samples, scenes, suggestions } from "@/db/schema";
import { aoiFromPreset } from "@/lib/aoi";
import { CLASS_PALETTE } from "@/lib/palette";
import {
  hashString,
  mulberry32,
  randomInRange,
  randomPointInBounds,
  simulateMetrics,
  simulatePrediction,
  squarePolygonAround,
} from "@/lib/simulation";
import type {
  ClassDefinition,
  LabelSource,
  ProjectStatus,
  SampleGeometry,
} from "@/types";

const globalForSeed = globalThis as typeof globalThis & {
  __satlabelSeedPromise?: Promise<void>;
};

interface SeedIteration {
  labeledSamples: number;
  newLabels: number;
}

interface SeedProject {
  name: string;
  description: string;
  status: ProjectStatus;
  aoiPreset: string;
  classNames: string[];
  sceneNames: string[];
  sampleCount: number;
  iterations: SeedIteration[];
  pendingBatch: number;
  ageDays: number;
}

const SEED_PROJECTS: SeedProject[] = [
  {
    name: "Central Valley Crop Mapping",
    description:
      "Sentinel-2 summer composites over Fresno County. Goal: separate irrigated crop types from fallow land for water-use reporting.",
    status: "in_progress",
    aoiPreset: "central-valley",
    classNames: ["Water", "Urban", "Alfalfa", "Fallow", "Orchard", "Vineyard"],
    sceneNames: [
      "S2_L2A_2026-06-18_T11SKC",
      "S2_L2A_2026-07-06_T11SKC",
    ],
    sampleCount: 52,
    iterations: [
      { labeledSamples: 16, newLabels: 16 },
      { labeledSamples: 27, newLabels: 11 },
      { labeledSamples: 38, newLabels: 11 },
      { labeledSamples: 52, newLabels: 14 },
    ],
    pendingBatch: 8,
    ageDays: 34,
  },
  {
    name: "Coastal Wetland Dynamics",
    description:
      "Land/water classification of Barataria Bay to monitor marsh loss and restoration outcomes across two seasons.",
    status: "completed",
    aoiPreset: "barataria",
    classNames: ["Open water", "Salt marsh", "Mudflat", "Upland vegetation"],
    sceneNames: [
      "S2_L2A_2026-05-02_T16RBU",
      "S2_L2A_2026-08-11_T16RBU",
    ],
    sampleCount: 78,
    iterations: [
      { labeledSamples: 22, newLabels: 22 },
      { labeledSamples: 38, newLabels: 16 },
      { labeledSamples: 55, newLabels: 17 },
      { labeledSamples: 68, newLabels: 13 },
      { labeledSamples: 78, newLabels: 10 },
    ],
    pendingBatch: 0,
    ageDays: 61,
  },
  {
    name: "Nairobi Urban Expansion",
    description:
      "Tracking built-up growth and informal settlements on the eastern fringe of Nairobi using monthly PlanetScope mosaics.",
    status: "in_progress",
    aoiPreset: "nairobi",
    classNames: ["Built-up", "Informal settlement", "Vegetation", "Bare soil", "Roads"],
    sceneNames: ["PS_2026-07-21_nairobi_east", "PS_2026-04-09_nairobi_east"],
    sampleCount: 34,
    iterations: [
      { labeledSamples: 14, newLabels: 14 },
      { labeledSamples: 24, newLabels: 10 },
      { labeledSamples: 34, newLabels: 10 },
    ],
    pendingBatch: 6,
    ageDays: 18,
  },
  {
    name: "Alpine Snow & Glacier Watch",
    description:
      "Seasonal snow-line extraction across the Bernese Alps. Fresh project — waiting for the first labeling pass.",
    status: "unlabeled",
    aoiPreset: "alps",
    classNames: ["Snow", "Glacier ice", "Exposed rock", "Meltwater"],
    sceneNames: ["S2_L2A_2026-08-02_T32TMS"],
    sampleCount: 4,
    iterations: [],
    pendingBatch: 0,
    ageDays: 3,
  },
];

function buildClasses(names: string[]): ClassDefinition[] {
  return names.map((name, index) => ({
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`,
    name,
    color: CLASS_PALETTE[index % CLASS_PALETTE.length],
  }));
}

function buildBands(count: number): string[] {
  const base = ["B02 (Blue)", "B03 (Green)", "B04 (Red)", "B08 (NIR)"];
  const extra = ["B11 (SWIR1)", "B12 (SWIR2)", "B05 (Red edge)", "SCL (Scene class)"];
  return [...base, ...extra].slice(0, count);
}

async function seedDatabase(): Promise<void> {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(projects);
  if ((existing[0]?.count ?? 0) > 0) return;

  for (const seed of SEED_PROJECTS) {
    const classes = buildClasses(seed.classNames);
    const aoi = aoiFromPreset(seed.aoiPreset);
    const rng = mulberry32(hashString(seed.name));
    const createdAt = new Date(Date.now() - seed.ageDays * 86_400_000);

    const [project] = await db
      .insert(projects)
      .values({
        name: seed.name,
        description: seed.description,
        numClasses: classes.length,
        classes,
        status: seed.status,
        aoi,
        createdAt,
        updatedAt: new Date(Date.now() - Math.min(seed.ageDays, 2) * 86_400_000),
      })
      .returning();

    const sceneRows = await Promise.all(
      seed.sceneNames.map(async (sceneName, index) => {
        const resolution = index === 1 ? 20 : 10;
        const [row] = await db
          .insert(scenes)
          .values({
            projectId: project.id,
            name: sceneName,
            fileName: `${sceneName}.tif`,
            sizeBytes: Math.round(
              (seed.aoiPreset === "nairobi" ? 168 : 412) * 1024 * 1024 +
                randomInRange(rng, 1, 60) * 1024 * 1024,
            ),
            bandCount: seed.aoiPreset === "nairobi" ? 4 : 6,
            width: 10980,
            height: 10980,
            crs: "EPSG:32611",
            resolutionM: resolution,
            bounds: {
              north: aoi.bounds.north + index * 0.01,
              south: aoi.bounds.south + index * 0.01,
              east: aoi.bounds.east,
              west: aoi.bounds.west,
            },
            bands: buildBands(seed.aoiPreset === "nairobi" ? 4 : 6),
            status: "ready",
            createdAt: new Date(createdAt.getTime() + index * 3_600_000),
          })
          .returning();
        return row;
      }),
    );

    // Historical labeled samples
    const sampleValues = Array.from({ length: seed.sampleCount }).map((_, index) => {
      const point = randomPointInBounds(aoi.bounds, rng);
      const isPolygon = rng() > 0.45;
      const classDef = classes[index % classes.length];
      const sources: LabelSource[] = ["human", "human", "human", "import", "model"];
      const prediction = simulatePrediction(classes, rng);
      return {
        projectId: project.id,
        sceneId: sceneRows[index % sceneRows.length].id,
        geometry: isPolygon
          ? squarePolygonAround(point, rng)
          : ({
              type: "Point",
              coordinates: [point.lng, point.lat] as [number, number],
            } satisfies SampleGeometry),
        classId: classDef.id,
        source: sources[Math.floor(rng() * sources.length)] as LabelSource,
        confidence: Number(randomInRange(rng, 0.72, 0.99).toFixed(3)),
        note:
          index % 7 === 0
            ? prediction.confidence < 0.6
              ? "Boundary confusion with neighbouring field"
              : "Verified against 2025 field survey"
            : null,
        status: "labeled" as const,
        iteration: Math.max(
          0,
          seed.iterations.findIndex((item) => index < item.labeledSamples),
        ),
        createdAt: new Date(
          createdAt.getTime() + index * 5 * 3_600_000 + Math.round(rng() * 3_600_000),
        ),
      };
    });
    if (sampleValues.length > 0) {
      await db.insert(samples).values(sampleValues);
    }

    // Iteration history
    for (const [index, iter] of seed.iterations.entries()) {
      const metrics = simulateMetrics(classes, iter.labeledSamples, seed.name, index + 1);
      await db.insert(iterations).values({
        projectId: project.id,
        iteration: index + 1,
        ...metrics,
        labeledSamples: iter.labeledSamples,
        newLabels: iter.newLabels,
        createdAt: new Date(
          createdAt.getTime() + (index + 1) * 2.4 * 86_400_000,
        ),
      });
    }

    // Pending active-learning batch
    if (seed.pendingBatch > 0) {
      const [batch] = await db
        .insert(batches)
        .values({
          projectId: project.id,
          iteration: seed.iterations.length + 1,
          size: seed.pendingBatch,
          labeledCount: 0,
          status: "pending",
          createdAt: new Date(Date.now() - 4 * 3_600_000),
        })
        .returning();

      const suggestionValues = Array.from({ length: seed.pendingBatch }).map(() => {
        const point = randomPointInBounds(aoi.bounds, rng);
        const prediction = simulatePrediction(classes, rng, 1.15);
        return {
          projectId: project.id,
          batchId: batch.id,
          lat: point.lat,
          lng: point.lng,
          predictedClassId: prediction.predictedClassId,
          confidence: prediction.confidence,
          uncertainty: prediction.uncertainty,
          status: "pending" as const,
          note: null,
          createdAt: new Date(Date.now() - 4 * 3_600_000 + Math.round(rng() * 600_000)),
        };
      });
      await db.insert(suggestions).values(suggestionValues);
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!globalForSeed.__satlabelSeedPromise) {
    globalForSeed.__satlabelSeedPromise = seedDatabase().catch((error) => {
      globalForSeed.__satlabelSeedPromise = undefined;
      throw error;
    });
  }
  await globalForSeed.__satlabelSeedPromise;
}
