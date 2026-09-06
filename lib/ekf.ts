import type { ParsedPoint } from "@/components/upload-panel";
import type { LngLat } from "@/lib/route";
import {
  EARTH_RADIUS_M,
  enuToLatLon,
  latLonToEnu,
  meridionalRadius,
  primeVerticalRadius,
  toRad,
} from "@/lib/geo";

export type EkfResult = {
  coordinates: LngLat[];
  points: ParsedPoint[];
  speeds: number[];
};

export type EkfOptions = {
  processNoise?: number;
  measurementNoiseMeters?: number;
  adaptive?: boolean;
  minNoiseMeters?: number;
  maxNoiseMeters?: number;
  window?: number;
  minWindow?: number;
};

type Mat = number[][];

const DEFAULTS: Required<
  Omit<EkfOptions, "adaptive"> & { adaptive: boolean }
> = {
  processNoise: 0.8,
  measurementNoiseMeters: 4,
  adaptive: true,
  minNoiseMeters: 1,
  maxNoiseMeters: 80,
  window: 15,
  minWindow: 6,
};

function matMul(a: Mat, b: Mat): Mat {
  const rows = a.length;
  const mid = b.length;
  const cols = b[0].length;
  const out: Mat = Array.from({ length: rows }, () =>
    new Array(cols).fill(0),
  );
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < mid; k += 1) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < cols; j += 1) {
        out[i][j] += aik * b[k][j];
      }
    }
  }
  return out;
}

function transpose(m: Mat): Mat {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

function invert2x2(m: Mat): Mat {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return [
    [m[1][1] / det, -m[0][1] / det],
    [-m[1][0] / det, m[0][0] / det],
  ];
}

function gapSeconds(prev: ParsedPoint, curr: ParsedPoint): number {
  if (prev.time !== undefined && curr.time !== undefined) {
    const dt = curr.time - prev.time;
    if (dt > 0) return Math.max(0.1, Math.min(dt, 60));
  }
  return 1;
}

export function ekfFilter(
  points: ParsedPoint[],
  options?: EkfOptions,
): EkfResult {
  const cfg: typeof DEFAULTS = { ...DEFAULTS, ...options };
  const n = points.length;
  if (n === 0) return { coordinates: [], points: [], speeds: [] };

  if (n === 1) {
    const p = points[0];
    return {
      coordinates: [[p.lon, p.lat]],
      points: [{ lon: p.lon, lat: p.lat, time: p.time }],
      speeds: [0],
    };
  }

  const lat0 = points[0].lat;
  const lon0 = points[0].lon;
  const lat0Rad = toRad(lat0);
  const lon0Rad = toRad(lon0);

  const rBase = (cfg.measurementNoiseMeters / EARTH_RADIUS_M) ** 2;
  const rMin = (cfg.minNoiseMeters / EARTH_RADIUS_M) ** 2;
  const rMax = (cfg.maxNoiseMeters / EARTH_RADIUS_M) ** 2;
  const q = cfg.processNoise;

  const x = new Float64Array(4);
  const [e0, n0] = latLonToEnu(lon0, lat0, lon0, lat0);
  x[0] = e0;
  x[1] = n0;

  let P: Mat = [
    [25, 0, 0, 0],
    [0, 25, 0, 0],
    [0, 0, 6.25, 0],
    [0, 0, 0, 6.25],
  ];

  const innovationWindow: number[][] = [];
  let R = [
    [rBase, 0],
    [0, rBase],
  ];

  const coordinates: LngLat[] = [];
  const resultPoints: ParsedPoint[] = [];
  const speeds: number[] = [];

  const pushOutput = (y: number, py: number, vx: number, vy: number, t?: number) => {
    const [flat, flon] = enuToLatLon(y, py, lat0Rad, lon0Rad);
    coordinates.push([flon, flat]);
    resultPoints.push({ lon: flon, lat: flat, time: t });
    speeds.push(Math.hypot(vx, vy));
  };

  pushOutput(x[0], x[1], x[2], x[3], points[0].time);

  for (let k = 1; k < n; k += 1) {
    const curr = points[k];
    const dt = gapSeconds(points[k - 1], curr);

    const F: Mat = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const Q: Mat = [
      [(dt3 / 3) * q, 0, (dt2 / 2) * q, 0],
      [0, (dt3 / 3) * q, 0, (dt2 / 2) * q],
      [(dt2 / 2) * q, 0, dt * q, 0],
      [0, (dt2 / 2) * q, 0, dt * q],
    ];

    const px = F[0][0] * x[0] + F[0][1] * x[1] + F[0][2] * x[2] + F[0][3] * x[3];
    const pn = F[1][0] * x[0] + F[1][1] * x[1] + F[1][2] * x[2] + F[1][3] * x[3];
    const pvx = x[2];
    const pvn = x[3];

    const FP = matMul(F, P);
    const FPF = matMul(FP, transpose(F));
    P = FPF.map((row, i) => row.map((v, j) => v + Q[i][j]));

    let phi = lat0Rad + pn / meridionalRadius(lat0Rad);
    for (let i = 0; i < 2; i += 1) {
      phi = lat0Rad + pn / meridionalRadius(phi);
    }
    const lambda = lon0Rad + px / (primeVerticalRadius(phi) * Math.cos(phi));

    const mRad = meridionalRadius(phi);
    const nvRad = primeVerticalRadius(phi);
    const cosPhi = Math.cos(phi);
    const H: Mat = [
      [0, 1 / mRad, 0, 0],
      [1 / (nvRad * cosPhi), 0, 0, 0],
    ];

    const z0 = toRad(curr.lat);
    const z1 = toRad(curr.lon);
    const nu = [z0 - phi, z1 - lambda];

    const HP = matMul(H, P);
    const HPH = matMul(HP, transpose(H));

    if (cfg.adaptive) {
      innovationWindow.push(nu);
      if (innovationWindow.length > cfg.window) {
        innovationWindow.shift();
      }
      if (innovationWindow.length >= cfg.minWindow) {
        const wlen = innovationWindow.length;
        let m0 = 0;
        let m1 = 0;
        for (const v of innovationWindow) {
          m0 += v[0];
          m1 += v[1];
        }
        m0 /= wlen;
        m1 /= wlen;
        let s00 = 0;
        let s11 = 0;
        for (const v of innovationWindow) {
          const d0 = v[0] - m0;
          const d1 = v[1] - m1;
          s00 += d0 * d0;
          s11 += d1 * d1;
        }
        s00 /= wlen - 1;
        s11 /= wlen - 1;
        const r00 = Math.min(rMax, Math.max(rMin, s00 - HPH[0][0]));
        const r11 = Math.min(rMax, Math.max(rMin, s11 - HPH[1][1]));
        R = [
          [r00, 0],
          [0, r11],
        ];
      }
    }

    const S = [
      [HPH[0][0] + R[0][0], HPH[0][1] + R[0][1]],
      [HPH[1][0] + R[1][0], HPH[1][1] + R[1][1]],
    ];
    const SInv = invert2x2(S);
    const PHt = matMul(P, transpose(H));
    const K = matMul(PHt, SInv);

    x[0] = px + (K[0][0] * nu[0] + K[0][1] * nu[1]);
    x[1] = pn + (K[1][0] * nu[0] + K[1][1] * nu[1]);
    x[2] = pvx + (K[2][0] * nu[0] + K[2][1] * nu[1]);
    x[3] = pvn + (K[3][0] * nu[0] + K[3][1] * nu[1]);

    const KHP = matMul(K, HP);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        P[i][j] -= KHP[i][j];
      }
    }

    pushOutput(x[0], x[1], x[2], x[3], curr.time);
  }

  return { coordinates, points: resultPoints, speeds };
}