"use client";

import { useEffect, useState } from "react";
import {
  getRutas,
  parseRutas,
  type RouteInfo,
  type RutasParams,
} from "@/lib/isync-api";
import type { DateRange } from "react-day-picker";

export function useDeviceRoute(deviceId: string | null) {
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (!deviceId) {
      setRoute(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    setRoute(null);
    setRouteLoading(true);
    setRouteError(null);

    const params: RutasParams = { limit: 2000 };
    if (range?.from)
      params.desde = range.from.toISOString().slice(0, 10);
    if (range?.to) params.hasta = range.to.toISOString().slice(0, 10);

    getRutas(deviceId, params)
      .then((fc) => {
        if (!cancelled) setRoute(parseRutas(fc));
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

  return { route, routeLoading, routeError, range, setRange };
}