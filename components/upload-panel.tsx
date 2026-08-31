"use client";

import { useRef } from "react";
import {
  Upload,
  X,
  Route as RouteIcon,
  FileText,
  Loader2,
} from "lucide-react";

const LAT_COLUMNS = ["lat", "latitude", "latitud", "y"];
const LNG_COLUMNS = ["lng", "lon", "lngt", "long", "longitude", "longitud", "x"];
const TIME_COLUMNS = ["time", "timestamp", "fecha", "ts", "t"];

function pickIndex(header: string[], names: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  return lower.findIndex((h) => names.includes(h));
}

export type ParsedPoint = {
  lon: number;
  lat: number;
  time?: number;
};

export function parseLngLats(
  text: string,
): { coordinates: [number, number][]; points: ParsedPoint[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { coordinates: [], points: [], rows: [] };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(delimiter);
  let lat = pickIndex(header, LAT_COLUMNS);
  let lng = pickIndex(header, LNG_COLUMNS);
  if (lat === -1) lat = 0;
  if (lng === -1) lng = 1;
  const timeIdx = pickIndex(header, TIME_COLUMNS);
  const dataLines = lines.slice(1);

  const coordinates: [number, number][] = [];
  const points: ParsedPoint[] = [];
  const rows: string[][] = [];
  for (const line of dataLines) {
    const cells = line.split(delimiter);
    const latNum = parseFloat(cells[lat]);
    const lngNum = parseFloat(cells[lng]);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) continue;
    coordinates.push([lngNum, latNum]);
    const point: ParsedPoint = { lon: lngNum, lat: latNum };
    if (timeIdx >= 0 && cells[timeIdx] !== undefined) {
      const raw = cells[timeIdx].trim();
      const numeric = Number(raw);
      if (!Number.isNaN(numeric)) {
        point.time = Math.floor(numeric / 1000);
      } else {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) point.time = Math.floor(parsed / 1000);
      }
    }
    points.push(point);
    rows.push(cells);
  }
  return { coordinates, points, rows };
}

type UploadPanelProps = {
  fileName: string | null;
  pointCount: number;
  matching?: boolean;
  onFile(text: string, name: string): void;
  onError(message: string): void;
  onClear(): void;
};

export function UploadPanel({
  fileName,
  pointCount,
  matching = false,
  onFile,
  onError,
  onClear,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onFile(String(reader.result ?? ""), file.name);
    };
    reader.onerror = () => onError("No se pudo leer el archivo.");
    reader.readAsText(file);
  };

  return (
    <div className="bg-background/95 absolute top-4 left-4 z-10 w-80 rounded-xl border shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <RouteIcon className="size-4" />
          <span className="text-sm font-semibold">Subir ruta CSV</span>
        </div>
        <button
          type="button"
          aria-label="Cerrar panel"
          onClick={onClear}
          className="hover:bg-muted text-muted-foreground inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          <Upload className="size-4" />
          {fileName ? "Cambiar archivo" : "Subir CSV"}
        </button>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <FileText className="size-3.5" />
          Se esperan columnas de latitud y longitud (lat/lng).
        </p>

        {matching && (
          <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Ajustando a calles con Valhalla…
          </div>
        )}

        {fileName && (
          <div className="bg-muted text-foreground flex items-center justify-between rounded-md px-3 py-2 text-xs">
            <span className="truncate">{fileName}</span>
            <span className="text-muted-foreground shrink-0">
              {pointCount} pts
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
