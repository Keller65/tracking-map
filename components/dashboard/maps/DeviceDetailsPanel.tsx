"use client";

import { format } from "date-fns";
import {
  CalendarIcon,
  Crosshair,
  Gauge,
  MapPinIcon,
  PathIcon,
  SpeedometerIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import type { DateRange } from "react-day-picker";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { StatChip } from "./StatChip";
import { DateRangePicker } from "./DateRangePicker";
import type { RouteInfo } from "@/lib/isync-api";
import type { Device } from "@/types/tracking";

const ROUTE_COLOR = "#3b82f6";

type DeviceDetailsPanelProps = {
  device: Device;
  wsConnected: boolean;
  selectedIsLive: boolean;
  route: RouteInfo | null;
  routeLoading: boolean;
  routeError: string | null;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  onClose: () => void;
  onFlyTo: () => void;
};

export function DeviceDetailsPanel({
  device,
  wsConnected,
  selectedIsLive,
  route,
  routeLoading,
  routeError,
  range,
  onRangeChange,
  onClose,
  onFlyTo,
}: DeviceDetailsPanelProps) {
  return (
    <Card
      className="bg-background/95 backdrop-blur-sm shadow-xl absolute top-4 right-4 z-10"
      style={{ width: 320, zIndex: 10 }}
    >
      <CardContent className="pt-3 pb-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Crosshair className="h-4 w-4" />
            {device.name}
          </CardTitle>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-base leading-none rounded-full w-6 h-6 flex items-center justify-center hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Realtime connection status */}
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
            wsConnected
              ? "bg-green-50 dark:bg-green-400/10 border-green-200 dark:border-green-400/20 text-green-600 dark:text-green-400"
              : "bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20 text-red-600 dark:text-red-400"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          {wsConnected
            ? "Conectado — rastreando en vivo"
            : "Desconectado del servidor"}
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 gap-2">
          <StatChip
            icon={<MapPinIcon className="h-3 w-3" />}
            label="Última Hora"
            value={`${format(new Date(device.timestamp), "hh:mm:ss a")}`}
            mono
          />
          <StatChip
            icon={<CalendarIcon className="h-3 w-3" />}
            label="Ultima Fecha"
            value={`${format(new Date(device.timestamp), "dd/MM/yyyy")}`}
            mono
          />
          <StatChip
            connected={selectedIsLive}
            icon={
              <span
                className={`w-2 h-2 rounded-full ${
                  selectedIsLive ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              />
            }
            label="WebSocket"
            value={selectedIsLive ? "En línea" : "Fuera de línea"}
            accent={selectedIsLive ? "#22c55e" : "#ef4444"}
          />
          <StatChip
            icon={<Gauge className="h-3 w-3" />}
            label="Velocidad"
            value={`${device.speed.toFixed(1)} km/h`}
            accent={ROUTE_COLOR}
          />
        </div>

        {/* Filtro de historial por rango de fechas */}
        <DateRangePicker range={range} onRangeChange={onRangeChange} />

        {/* Route summary (REST) */}
        {routeLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span className="w-3 h-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
            Cargando ruta histórica…
          </div>
        )}
        {routeError && !routeLoading && (
          <p className="text-xs text-red-600 dark:text-red-400 px-1">
            {routeError}
          </p>
        )}
        {route && route.lines.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1">
              <PathIcon className="h-3 w-3" />
              Resumen de la ruta
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatChip
                icon={<PathIcon className="h-3 w-3" />}
                label="Distancia"
                value={`${route.km.toFixed(1)} km`}
                accent={ROUTE_COLOR}
                mono
              />
              <StatChip
                icon={<TimerIcon className="h-3 w-3" />}
                label="Duración"
                value={`${(route.duracionMin / 60).toFixed(1)} h`}
                accent={ROUTE_COLOR}
                mono
              />
              <StatChip
                icon={<SpeedometerIcon className="h-3 w-3" />}
                label="Vel. promedio"
                value={`${route.velocidadPromedio.toFixed(1)} km/h`}
                accent={ROUTE_COLOR}
                mono
              />
            </div>
          </div>
        )}

        {/* Fly to button */}
        <button
          onClick={onFlyTo}
          className="w-full text-xs py-1.5 px-3 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          Centrar en mapa
        </button>
      </CardContent>
    </Card>
  );
}