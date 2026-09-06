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