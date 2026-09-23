"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUltimasPosiciones } from "@/lib/isync-api";
import { Device } from "@/types/tracking";

export function useDevicePositions() {
  const [devices, setDevices] = useState<Map<string, Device>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const fc = await getUltimasPosiciones();
      setDevices((prev) => {
        let changed = false;
        const next = new Map(prev);

        fc.features.forEach((feat) => {
          const p = feat.properties;
          const id = String(p.deviceId ?? "");
          if (!id) return;
          const timestamp = Date.parse(p.ts);
          if (!Number.isFinite(timestamp)) return;

          const existing = next.get(id);
          if (existing && existing.timestamp > timestamp) return;

          const speed = Number(p.speed ?? 0);
          const isOnline = Date.now() - timestamp < 5 * 60_000;

          next.set(id, {
            id,
            name: p.deviceName || existing?.name || id,
            position: feat.geometry.coordinates,
            speed: Number.isFinite(speed) ? speed * 3.6 : 0,
            lastUpdate: p.ts,
            timestamp,
            trail: existing?.trail
              ? [...existing.trail, feat.geometry.coordinates]
              : [feat.geometry.coordinates],
            trailPoints: existing?.trailPoints ?? [],
            totalDistance: existing?.totalDistance ?? 0,
            isMoving: speed > 0,
            batteryLevel: existing?.batteryLevel ?? 0,
            isOnline,
          });
          changed = true;
        });

        return changed ? next : prev;
      });
    } catch {
      // Silencioso: el WS puede seguir funcionando aunque la API falle.
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Carga inicial única (después se actualiza solo con el botón).
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { devices, setDevices, refreshing, refresh };
}