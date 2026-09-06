import type { ParsedPoint } from "@/components/upload-panel";
import { haversineMeters } from "@/lib/geo";

const MAX_PLAUSIBLE_SPEED_MPS = 50;

function detectOutlierIndex(
  points: ParsedPoint[],
  index: number,
  distances: number[],
): boolean {
  const previous = points[index - 1];
  const point = points[index];
  if (!previous || !point) return false;

  const distance = distances[index];

  if (previous.time !== undefined && point.time !== undefined) {
    const dt = Math.max(1, point.time - previous.time);
    const speedMps = distance / dt;
    return speedMps > MAX_PLAUSIBLE_SPEED_MPS;
  }

  const sorted = [...distances].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const threshold = Math.max(med * 8, 150);
  return distance > threshold;
}

export function detectOutliers(points: ParsedPoint[]): boolean[] {
  const n = points.length;
  const outliers = new Array<boolean>(n).fill(false);
  if (n < 3) return outliers;

  const distances = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    distances[i] = haversineMeters(a.lon, a.lat, b.lon, b.lat);
  }

  for (let i = 1; i < n - 1; i += 1) {
    if (detectOutlierIndex(points, i, distances)) {
      outliers[i] = true;
    }
  }

  return outliers;
}

export type OutlierFilterResult = {
  points: ParsedPoint[];
  removedCount: number;
  outliers: boolean[];
};

export function filterOutliers(points: ParsedPoint[]): OutlierFilterResult {
  const outliers = detectOutliers(points);
  const removedCount = outliers.filter(Boolean).length;
  return {
    points: points.filter((_, index) => !outliers[index]),
    removedCount,
    outliers,
  };
}
