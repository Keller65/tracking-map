"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  getRutas,
  parseRutas,
  type LonLat,
  type RouteInfo,
  type RutasParams,
} from "@/lib/isync-api";
import type { DateRange } from "react-day-picker";

async function matchRouteToRoads(lines: LonLat[][]): Promise<LonLat[][]> {
  const res = await fetch("/api/mapbox-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? "No se pudo ajustar la ruta a las calles.");
  }
  if (!Array.isArray(data?.lines)) {
    throw new Error("Respuesta inválida de map-matching.");
  }
  return data.lines as LonLat[][];
}

export function useDeviceRoute(
  deviceId: string | null,
  snapToRoads = false,
) {
  const [rawRoute, setRawRoute] = useState<RouteInfo | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (!deviceId) {
      setRawRoute(null);
      setRoute(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    const from = range?.from;
    const to = range?.to;

    // El historial solo se carga cuando hay un rango de fechas completo.
    if (!from || !to) {
      setRawRoute(null);
      setRoute(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    setRawRoute(null);
    setRoute(null);
    setRouteLoading(true);
    setRouteError(null);

    const params: RutasParams = {
      limit: 2000,
      desde: format(from, "yyyy-MM-dd"),
      hasta: format(to, "yyyy-MM-dd"),
    };

    getRutas(deviceId, params)
      .then((fc) => {
        if (!cancelled) setRawRoute(parseRutas(fc));
      })
      .catch((err) => {
        if (!cancelled)
          setRouteError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la ruta del dispositivo.",
          );
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, range]);

  // Ajuste a calles (Mapbox Map Matching) sobre la ruta cruda.
  useEffect(() => {
    if (!rawRoute || rawRoute.lines.length === 0) {
      setRoute(rawRoute);
      setSnapping(false);
      return;
    }

    if (!snapToRoads) {
      setRoute(rawRoute);
      setSnapping(false);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    setSnapping(true);
    setRouteError(null);

    matchRouteToRoads(rawRoute.lines)
      .then((lines) => {
        if (!cancelled) setRoute({ ...rawRoute, lines });
      })
      .catch((err) => {
        if (cancelled) return;
        setRouteError(
          err instanceof Error
            ? err.message
            : "No se pudo ajustar la ruta a las calles.",
        );
        setRoute(rawRoute);
      })
      .finally(() => {
        if (!cancelled) setSnapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rawRoute, snapToRoads]);

  return { route, routeLoading, routeError, snapping, range, setRange };
}
