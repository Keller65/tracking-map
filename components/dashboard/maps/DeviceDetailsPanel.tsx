"use client";

import { format } from "date-fns";
import {
  CalendarIcon,
  Clock,
  Crosshair,
  Gauge,
  NavigationArrow,
  PathIcon,
  Ruler,
  SpeedometerIcon,
  TimerIcon,
  WifiHigh,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import type { DateRange } from "react-day-picker";
import { StatChip } from "./StatChip";
import { DateRangePicker } from "./DateRangePicker";
import { Button } from "@/components/ui/button";
import type { RouteInfo } from "@/lib/isync-api";
import type { Device } from "@/types/tracking";

const ROUTE_COLOR = "#3b82f6";
const ONLINE_COLOR = "#22c55e";
const OFFLINE_COLOR = "#ef4444";

type DeviceDetailsPanelProps = {
  device: Device;
  wsConnected: boolean;
  selectedIsLive: boolean;
  route: RouteInfo | null;
  routeLoading: boolean;
  routeError: string | null;
  snapping: boolean;
  snapToRoads: boolean;
  onSnapToRoadsChange: (enabled: boolean) => void;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  onClose: () => void;
  onFlyTo: () => void;
};

function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground" />
      {label}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center justify-between px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className="font-mono font-semibold tabular-nums"
        style={{ color: ROUTE_COLOR }}
      >
        {value}
      </span>
    </li>
  );
}

export function DeviceDetailsPanel({
  device,
  wsConnected,
  selectedIsLive,
  route,
  routeLoading,
  routeError,
  snapping,
  snapToRoads,
  onSnapToRoadsChange,
  range,
  onRangeChange,
  onClose,
  onFlyTo,
}: DeviceDetailsPanelProps) {
  const hasCompleteRange = Boolean(range?.from && range?.to);
  const hasRoute = Boolean(
    route && (route.lines.length > 0 || (route.privateLines?.length ?? 0) > 0),
  );
  const isBusy = routeLoading || snapping;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              selectedIsLive
                ? "bg-green-500/15 text-green-600 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Crosshair className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight">
              {device.name}
            </h2>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {device.id}
            </p>
          </div>
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          aria-label="Cerrar panel"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* Contenido */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* Estado de conexión */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            wsConnected
              ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {wsConnected ? (
            <WifiHigh className="h-4 w-4" weight="bold" />
          ) : (
            <WifiSlash className="h-4 w-4" weight="bold" />
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wsConnected ? "animate-pulse bg-green-500" : "bg-red-500"
              }`}
            />
            {wsConnected ? "Rastreando en vivo" : "Sin conexión al servidor"}
          </span>
        </div>

        {/* Telemetría */}
        <Section icon={<Gauge className="h-3.5 w-3.5" />} title="Telemetría">
          <div className="grid grid-cols-2 gap-2">
            <StatChip
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Última hora"
              value={format(new Date(device.timestamp), "hh:mm:ss a")}
              mono
            />
            <StatChip
              icon={<CalendarIcon className="h-3.5 w-3.5" />}
              label="Última fecha"
              value={format(new Date(device.timestamp), "dd/MM/yyyy")}
              mono
            />
            <StatChip
              icon={
                selectedIsLive ? (
                  <WifiHigh className="h-3.5 w-3.5" />
                ) : (
                  <WifiSlash className="h-3.5 w-3.5" />
                )
              }
              label="Conexión"
              value={selectedIsLive ? "En línea" : "Fuera de línea"}
              connected={selectedIsLive}
              accent={selectedIsLive ? ONLINE_COLOR : OFFLINE_COLOR}
            />
            <StatChip
              icon={<Gauge className="h-3.5 w-3.5" />}
              label="Velocidad"
              value={`${device.speed.toFixed(1)} km/h`}
              accent={ROUTE_COLOR}
            />
          </div>
        </Section>

        {/* Historial */}
        <Section
          icon={<CalendarIcon className="h-3.5 w-3.5" />}
          title="Historial"
        >
          <DateRangePicker range={range} onRangeChange={onRangeChange} />

          {!hasCompleteRange && (
            <p className="px-1 text-xs text-muted-foreground">
              Selecciona un rango de fechas para cargar el historial.
            </p>
          )}

          {hasCompleteRange && (
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-foreground">
                  Ajustar Ruta
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Calles en sólido; fuera de vía punteado al 60%
                </span>
              </span>
              <input
                type="checkbox"
                checked={snapToRoads}
                disabled={isBusy}
                onChange={(event) => onSnapToRoadsChange(event.target.checked)}
                className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                aria-label="Ajustar ruta a las calles"
              />
            </label>
          )}

          {snapToRoads && (route?.privateLines?.length ?? 0) > 0 && (
            <div className="flex items-center gap-4 px-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-5 rounded-full"
                  style={{ background: ROUTE_COLOR }}
                />
                Calle
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-5 border-t-2 border-dashed"
                  style={{ borderColor: ROUTE_COLOR, opacity: 0.6 }}
                />
                Fuera de vía
              </span>
            </div>
          )}

          {routeLoading && <Spinner label="Cargando ruta histórica…" />}
          {snapping && <Spinner label="Ajustando la ruta a las calles…" />}
          {routeError && !isBusy && (
            <p className="px-1 text-xs text-red-600 dark:text-red-400">
              {routeError}
            </p>
          )}
        </Section>

        {/* Resumen de ruta */}
        {hasRoute && route && (
          <Section
            icon={<PathIcon className="h-3.5 w-3.5" />}
            title="Resumen de la ruta"
          >
            <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-muted/20">
              <SummaryRow
                icon={<Ruler className="h-3.5 w-3.5" />}
                label="Distancia"
                value={`${route.km.toFixed(1)} km`}
              />
              <SummaryRow
                icon={<TimerIcon className="h-3.5 w-3.5" />}
                label="Duración"
                value={`${(route.duracionMin / 60).toFixed(1)} h`}
              />
              <SummaryRow
                icon={<SpeedometerIcon className="h-3.5 w-3.5" />}
                label="Vel. promedio"
                value={`${route.velocidadPromedio.toFixed(1)} km/h`}
              />
            </ul>
          </Section>
        )}
      </div>

      {/* Pie */}
      <div className="border-t border-border p-3">
        <Button
          onClick={onFlyTo}
          variant="outline"
          className="w-full gap-2 text-xs"
        >
          <NavigationArrow className="h-4 w-4" weight="fill" />
          Centrar en mapa
        </Button>
      </div>
    </div>
  );
}
