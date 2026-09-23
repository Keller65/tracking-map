"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, MapControls, MapRoute, type MapRef } from "@/components/ui/map";
import {
  UploadPanel,
  parseLngLats,
  type ParsedPoint,
} from "@/components/upload-panel";
import {
  resampleRoute,
  simplifyRoute,
  type LngLat,
} from "@/lib/route";
import { filterOutliers } from "@/lib/outliers";
import { ekfFilter } from "@/lib/ekf";

const RESAMPLE_SPACING_M = 20;
const SIMPLIFY_TOLERANCE_M = 6;

export default function Home() {
  const mapRef = useRef<MapRef>(null);
  const [allPoints, setAllPoints] = useState<ParsedPoint[]>([]);
  const [matchedRoute, setMatchedRoute] = useState<LngLat[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [mapMatchingEnabled, setMapMatchingEnabled] = useState(false);
  const [smoothingEnabled, setSmoothingEnabled] = useState(false);
  const [outlierDetectionEnabled, setOutlierDetectionEnabled] =
    useState(false);
  const [ekfEnabled, setEkfEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outlierResult = useMemo(
    () =>
      outlierDetectionEnabled ? filterOutliers(allPoints) : null,
    [allPoints, outlierDetectionEnabled],
  );
  const removedOutlierCount = outlierResult?.removedCount ?? 0;
  const basePoints = outlierResult?.points ?? allPoints;

  const ekfResult = useMemo(
    () => (ekfEnabled ? ekfFilter(basePoints) : null),
    [basePoints, ekfEnabled],
  );
  const workingPoints = ekfResult?.points ?? basePoints;

  const rawRoute = useMemo(
    () => workingPoints.map((p) => [p.lon, p.lat] as LngLat),
    [workingPoints],
  );

  const displayedRawRoute = useMemo(() => {
    if (!smoothingEnabled) return rawRoute;
    return simplifyRoute(
      resampleRoute(rawRoute, RESAMPLE_SPACING_M),
      SIMPLIFY_TOLERANCE_M,
    );
  }, [rawRoute, smoothingEnabled]);

  const displayedMatchedRoute = useMemo(() => {
    if (!smoothingEnabled) return matchedRoute;
    return simplifyRoute(
      resampleRoute(matchedRoute, RESAMPLE_SPACING_M),
      SIMPLIFY_TOLERANCE_M,
    );
  }, [matchedRoute, smoothingEnabled]);

  const fitRoute = useCallback((coordinates: LngLat[]) => {
    const map = mapRef.current;
    if (!map || coordinates.length === 0) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coordinates) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 800, maxZoom: 16 },
    );
  }, []);

  useEffect(() => {
    if (rawRoute.length >= 2) fitRoute(rawRoute);
  }, [rawRoute, fitRoute]);

  const runMatching = useCallback(
    async (points: ParsedPoint[]) => {
      const ordered = [...points].sort(
        (a, b) => (a.time ?? 0) - (b.time ?? 0),
      );
      setMatchedRoute([]);
      setMatching(true);
      setError(null);
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shape: ordered }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Error de map-matching.");
        }
        const coords = data?.geometry?.coordinates as LngLat[] | undefined;
        if (Array.isArray(coords) && coords.length >= 2) {
          setMatchedRoute(coords);
          fitRoute(coords);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo procesar la ruta.",
        );
      } finally {
        setMatching(false);
      }
    },
    [fitRoute],
  );

  return (
    <div className="relative h-dvh w-full">
      <Map
        ref={mapRef}
        viewport={{ center: [-99.1332, 19.4326], zoom: 10 }}
        theme="light"
      >
        {displayedRawRoute.length >= 2 && (
          <MapRoute
            coordinates={displayedRawRoute}
            color="#94a3b8"
            width={3}
            opacity={0.5}
          />
        )}
        {displayedMatchedRoute.length >= 2 && (
          <MapRoute
            coordinates={displayedMatchedRoute}
            color="#16a34a"
            width={5}
            opacity={0.9}
          />
        )}
        <MapControls
          position="bottom-right"
          showZoom
          showCompass
          showLocate
          showFullscreen
        />
      </Map>

      <UploadPanel
        fileName={fileName}
        pointCount={workingPoints.length}
        matching={matching}
        onFile={(text, name) => {
          const { coordinates, points } = parseLngLats(text);
          if (coordinates.length < 2) {
            setError(
              "El CSV no tiene suficientes puntos válidos (columnas lat/lng).",
            );
            setAllPoints([]);
            setMatchedRoute([]);
            setFileName(null);
            return;
          }
          setError(null);
          setFileName(name);
          setAllPoints(
            points.length >= 2
              ? points
              : coordinates.map(([lon, lat]) => ({ lon, lat })),
          );
          setMatchedRoute([]);
          setMapMatchingEnabled(false);
        }}
        mapMatchingEnabled={mapMatchingEnabled}
        catmullRomEnabled={smoothingEnabled}
        outlierDetectionEnabled={outlierDetectionEnabled}
        ekfEnabled={ekfEnabled}
        removedOutlierCount={removedOutlierCount}
        onMapMatchingChange={(enabled) => {
          setMapMatchingEnabled(enabled);
          if (enabled) {
            runMatching(workingPoints);
          } else {
            setMatchedRoute([]);
          }
        }}
        onCatmullRomChange={setSmoothingEnabled}
        onOutlierDetectionChange={(enabled) => {
          setOutlierDetectionEnabled(enabled);
          setMatchedRoute([]);
          if (mapMatchingEnabled) {
            const base = enabled
              ? filterOutliers(allPoints).points
              : allPoints;
            runMatching(ekfEnabled ? ekfFilter(base).points : base);
          }
        }}
        onEkfChange={(enabled) => {
          setEkfEnabled(enabled);
          setMatchedRoute([]);
          if (mapMatchingEnabled) {
            const base = outlierDetectionEnabled
              ? filterOutliers(allPoints).points
              : allPoints;
            runMatching(enabled ? ekfFilter(base).points : base);
          }
        }}
        onError={setError}
        onClear={() => {
          setAllPoints([]);
          setMatchedRoute([]);
          setFileName(null);
          setMapMatchingEnabled(false);
          setSmoothingEnabled(false);
          setOutlierDetectionEnabled(false);
          setEkfEnabled(false);
          setError(null);
        }}
      />

      {matching && (
        <div className="bg-primary text-primary-foreground absolute top-4 right-4 z-10 rounded-md px-4 py-2 text-sm shadow-lg">
          Procesando ruta con Valhalla…
        </div>
      )}

      {error && !matching && (
        <div className="bg-destructive text-destructive-foreground absolute top-4 right-4 z-10 rounded-md px-4 py-2 text-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}