import { haversineMeters, toRad } from "@/lib/geo";

export type LngLat = [number, number];

/** Interpolates a route with a uniform Catmull-Rom spline. */
export function catmullRomRoute(
  coordinates: LngLat[],
  samplesPerSegment = 8,
): LngLat[] {
  if (coordinates.length < 3) return coordinates;

  const samples = Math.max(2, Math.floor(samplesPerSegment));
  const smoothed: LngLat[] = [];

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const p0 = coordinates[index - 1] ?? coordinates[index];
    const p1 = coordinates[index];
    const p2 = coordinates[index + 1];
    const p3 = coordinates[index + 2] ?? p2;

    for (let step = 0; step < samples; step += 1) {
      const t = step / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const longitude =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const latitude =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      smoothed.push([longitude, latitude]);
    }
  }

  smoothed.push(coordinates[coordinates.length - 1]);
  return smoothed;
}

/** Uniform-distance Catmull-Rom resampling of a route (Strava-like cadence). */
export function resampleRoute(
  coordinates: LngLat[],
  spacingMeters = 20,
  samplesPerSegment = 10,
): LngLat[] {
  if (coordinates.length < 2) return coordinates;

  const dense = catmullRomRoute(coordinates, samplesPerSegment);
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i += 1) {
    const a = dense[i - 1];
    const b = dense[i];
    cum.push(cum[i - 1] + haversineMeters(a[0], a[1], b[0], b[1]));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return dense;

  const result: LngLat[] = [];
  let target = 0;
  for (let i = 1; i < dense.length; i += 1) {
    const seg = cum[i] - cum[i - 1];
    while (target <= total && target <= cum[i]) {
      const t = seg > 0 ? (target - cum[i - 1]) / seg : 0;
      result.push([
        dense[i - 1][0] + (dense[i][0] - dense[i - 1][0]) * t,
        dense[i - 1][1] + (dense[i][1] - dense[i - 1][1]) * t,
      ]);
      target += spacingMeters;
    }
  }

  const last = dense[dense.length - 1];
  const lastOut = result[result.length - 1];
  if (
    !lastOut ||
    haversineMeters(lastOut[0], lastOut[1], last[0], last[1]) >
      spacingMeters * 0.5
  ) {
    result.push(last);
  }
  return result;
}

function pointToSegmentMeters(
  p: LngLat,
  a: LngLat,
  b: LngLat,
): number {
  const lonScale = 111320 * Math.cos(toRad(p[1]));
  const latScale = 110574;
  const ax = (a[0] - p[0]) * lonScale;
  const ay = (a[1] - p[1]) * latScale;
  const bx = (b[0] - p[0]) * lonScale;
  const by = (b[1] - p[1]) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

/** Douglas-Peucker simplification for a clean, Strava-like polyline. */
export function simplifyRoute(
  coordinates: LngLat[],
  toleranceMeters = 6,
): LngLat[] {
  if (coordinates.length < 3) return coordinates;

  const keep = new Set<number>([0, coordinates.length - 1]);
  const stack: Array<[number, number]> = [[0, coordinates.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    if (end - start < 2) continue;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = pointToSegmentMeters(
        coordinates[i],
        coordinates[start],
        coordinates[end],
      );
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > toleranceMeters && index >= 0) {
      keep.add(index);
      stack.push([start, index], [index, end]);
    }
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => coordinates[i]);
}