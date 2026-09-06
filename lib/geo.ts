export const EARTH_RADIUS_M = 6371000;

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

export function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function meridionalRadius(latRad: number): number {
  const s = Math.sin(latRad);
  const denom = Math.sqrt(1 - WGS84_E2 * s * s);
  return (WGS84_A * (1 - WGS84_E2)) / (denom * denom * denom);
}

export function primeVerticalRadius(latRad: number): number {
  const s = Math.sin(latRad);
  return WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
}

export function latLonToEnu(
  lonDeg: number,
  latDeg: number,
  lon0Deg: number,
  lat0Deg: number,
): [number, number] {
  const latRad = toRad(latDeg);
  const lat0Rad = toRad(lat0Deg);
  const dLat = latRad - lat0Rad;
  const dLon = toRad(lonDeg) - toRad(lon0Deg);
  const east = primeVerticalRadius(lat0Rad) * Math.cos(lat0Rad) * dLon;
  const north = meridionalRadius(lat0Rad) * dLat;
  return [east, north];
}

export function enuToLatLon(
  east: number,
  north: number,
  lat0Rad: number,
  lon0Rad: number,
): [number, number] {
  let phi = lat0Rad + north / meridionalRadius(lat0Rad);
  for (let i = 0; i < 2; i += 1) {
    phi = lat0Rad + north / meridionalRadius(phi);
  }
  const lambda = lon0Rad + east / (primeVerticalRadius(phi) * Math.cos(phi));
  return [phi * (180 / Math.PI), lambda * (180 / Math.PI)];
}