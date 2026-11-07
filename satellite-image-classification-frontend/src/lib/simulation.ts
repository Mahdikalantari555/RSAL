import type {
  Bounds,
  ClassDefinition,
  ClassMetric,
  ConfusionMatrix,
  LatLng,
} from "@/types";

/* -------------------------------------------------------------------------- */
/* Deterministic pseudo-randomness                                             */
/* -------------------------------------------------------------------------- */

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

export function randomPointInBounds(
  bounds: Bounds,
  rng: () => number,
  inset = 0.14,
): LatLng {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  return {
    lat: round(
      bounds.south + latSpan * inset + latSpan * (1 - inset * 2) * rng(),
      6,
    ),
    lng: round(
      bounds.west + lngSpan * inset + lngSpan * (1 - inset * 2) * rng(),
      6,
    ),
  };
}

export function squarePolygonAround(
  point: LatLng,
  rng: () => number,
  sizeDeg = 0.0035,
): { type: "Polygon"; coordinates: number[][][] } {
  const halfLat = (sizeDeg * randomInRange(rng, 0.7, 1.4)) / 2;
  const halfLng = halfLat * (0.9 + rng() * 0.5);
  const { lat, lng } = point;
  return {
    type: "Polygon",
    coordinates: [
      [
        [round(lng - halfLng, 6), round(lat - halfLat, 6)],
        [round(lng + halfLng, 6), round(lat - halfLat, 6)],
        [round(lng + halfLng, 6), round(lat + halfLat, 6)],
        [round(lng - halfLng, 6), round(lat + halfLat, 6)],
        [round(lng - halfLng, 6), round(lat - halfLat, 6)],
      ],
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Model inference simulation                                                 */
/* -------------------------------------------------------------------------- */

export interface SimulatedPrediction {
  predictedClassId: string;
  confidence: number;
  uncertainty: number;
  classScores: Record<string, number>;
}

/**
 * Simulates a calibrated classifier: uncertainty peaks when the two most likely
 * classes are close. Used to generate realistic active-learning query batches.
 */
export function simulatePrediction(
  classes: ClassDefinition[],
  rng: () => number,
  entropyScale = 1,
): SimulatedPrediction {
  const logits = classes.map(() => randomInRange(rng, -1, 1));
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp((value - max) / 0.55));
  const total = exps.reduce((acc, value) => acc + value, 0);
  const probabilities = exps.map((value) => value / total);
  const order = probabilities
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);

  const top = order[0];
  const runnerUp = order[1] ?? order[0];
  const margin = top.value - runnerUp.value;
  const confidence = clamp(0.42 + margin * 1.35, 0.41, 0.985);
  const uncertainty = clamp(
    (1 - confidence) * (0.85 + rng() * 0.3) * entropyScale,
    0.02,
    0.98,
  );

  const classScores: Record<string, number> = {};
  classes.forEach((cls, index) => {
    classScores[cls.id] = round(probabilities[index], 4);
  });

  return {
    predictedClassId: classes[top.index].id,
    confidence: round(confidence, 3),
    uncertainty: round(uncertainty, 3),
    classScores,
  };
}

/* -------------------------------------------------------------------------- */
/* Training metrics simulation                                                */
/* -------------------------------------------------------------------------- */

export interface SimulatedMetrics {
  accuracy: number;
  f1: number;
  kappa: number;
  precision: number;
  recall: number;
  trainSeconds: number;
  confusionMatrix: ConfusionMatrix;
  classMetrics: ClassMetric[];
  confidenceHistogram: number[];
}

export function simulateMetrics(
  classes: ClassDefinition[],
  labeledSamples: number,
  seed: string,
  iteration: number,
): SimulatedMetrics {
  const rng = mulberry32(hashString(`${seed}:metrics:${iteration}`));
  const labels = classes.map((cls) => cls.id);
  const n = Math.max(classes.length, 2);

  const base = 0.615 + 0.046 * Math.log(labeledSamples + 1);
  const accuracy = round(clamp(base + randomInRange(rng, -0.012, 0.012), 0.6, 0.968), 4);
  const f1 = round(clamp(accuracy - randomInRange(rng, 0.008, 0.03), 0.55, 0.965), 4);
  const kappa = round(
    clamp((accuracy - 1 / n) / (1 - 1 / n) + randomInRange(rng, -0.01, 0.01), 0.4, 0.95),
    4,
  );
  const precision = round(clamp(f1 + randomInRange(rng, -0.015, 0.02), 0.5, 0.97), 4);
  const recall = round(clamp(accuracy + randomInRange(rng, -0.02, 0.015), 0.5, 0.97), 4);

  const matrix: number[][] = labels.map(() => labels.map(() => 0));
  const classMetrics: ClassMetric[] = labels.map((classId, row) => {
    const support = Math.max(4, Math.round((labeledSamples / n) * randomInRange(rng, 0.7, 1.3)));
    const classAccuracy = clamp(accuracy + randomInRange(rng, -0.11, 0.09), 0.42, 0.985);
    const correct = Math.max(1, Math.round(support * classAccuracy));
    matrix[row][row] = correct;
    let errorsLeft = Math.max(0, support - correct);
    while (errorsLeft > 0) {
      const target = Math.floor(rng() * labels.length);
      if (target === row) continue;
      matrix[row][target] += 1;
      errorsLeft -= 1;
    }
    const classPrecision = round(clamp(classAccuracy + randomInRange(rng, -0.05, 0.05), 0.4, 0.99), 3);
    const classRecall = round(clamp(classAccuracy + randomInRange(rng, -0.06, 0.04), 0.4, 0.99), 3);
    return {
      classId,
      precision: classPrecision,
      recall: classRecall,
      f1: round((2 * classPrecision * classRecall) / (classPrecision + classRecall), 3),
      support,
    };
  });

  // Confidence histogram shifted toward high confidence as the model improves.
  const histogram = new Array(10).fill(0).map(() => randomInRange(rng, 0.2, 1));
  const shift = clamp((accuracy - 0.55) * 9, 0.5, 5.5);
  const weighted = histogram.map((value, index) => value * Math.exp((index - 9) * (1 - shift / 5)));
  const histTotal = weighted.reduce((acc, value) => acc + value, 0);
  const confidenceHistogram = weighted.map((value) => round(value / histTotal, 4));

  return {
    accuracy,
    f1,
    kappa,
    precision,
    recall,
    trainSeconds: round(6.5 + labeledSamples * 0.085 + rng() * 3, 2),
    confusionMatrix: { labels, matrix },
    classMetrics,
    confidenceHistogram,
  };
}

export function meanConfidence(histogram: number[]): number {
  if (histogram.length === 0) return 0;
  return round(
    histogram.reduce((acc, value, index) => acc + value * ((index + 0.5) / histogram.length), 0),
    3,
  );
}
