"use client";

import { useCallback, useRef, useState } from "react";
import { Map, MapControls, MapRoute, type MapRef } from "@/components/ui/map";
import { UploadPanel, parseLngLats, type ParsedPoint } from "@/components/upload-panel";

type LngLat = [number, number];

export default function Home() {
  const mapRef = useRef<MapRef>(null);
  const [rawRoute, setRawRoute] = useState<LngLat[]>([]);
  const [matchedRoute, setMatchedRoute] = useState<LngLat[]>([]);
  const [parsedPoints, setParsedPoints] = useState<ParsedPoint[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [mapMatchingEnabled, setMapMatchingEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        {rawRoute.length >= 2 && (
          <MapRoute
            coordinates={rawRoute}
            color="#94a3b8"
            width={3}
            opacity={0.5}
          />
        )}
        {matchedRoute.length >= 2 && (
          <MapRoute
            coordinates={matchedRoute}
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
        pointCount={rawRoute.length}
        matching={matching}
        onFile={(text, name) => {
          const { coordinates, points } = parseLngLats(text);
          if (coordinates.length < 2) {
            setError(
              "El CSV no tiene suficientes puntos válidos (columnas lat/lng).",
            );
            setRawRoute([]);
            setMatchedRoute([]);
            setFileName(null);
            return;
          }
          setError(null);
          setFileName(name);
          setRawRoute(coordinates);
          setParsedPoints(
            points.length >= 2
              ? points
              : coordinates.map(([lon, lat]) => ({ lon, lat })),
          );
          setMatchedRoute([]);
          setMapMatchingEnabled(false);
          fitRoute(coordinates);
        }}
        mapMatchingEnabled={mapMatchingEnabled}
        onMapMatchingChange={(enabled) => {
          setMapMatchingEnabled(enabled);
          if (enabled) {
            runMatching(parsedPoints);
          } else {
            setMatchedRoute([]);
          }
        }}
        onError={setError}
        onClear={() => {
          setRawRoute([]);
          setMatchedRoute([]);
          setParsedPoints([]);
          setFileName(null);
          setMapMatchingEnabled(false);
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
