"use client";

import {
  ArrowsClockwiseIcon,
  BatteryFull,
  Car,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlass,
  MapPin,
  MapTrifoldIcon,
  PencilSimpleLine,
  X,
} from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { fmtBattery, fmtTime } from "@/lib/format";
import type { Device } from "@/types/tracking";

type DeviceListPanelProps = {
  devices: Device[];
  wsConnected: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  selectedDeviceId: string | null;
  onDeviceClick: (id: string) => void;
  showGeovallas: boolean;
  geovallasLoading: boolean;
  geovallaCount: number;
  onToggleGeovallas: () => void;
  geovallaDrawing: boolean;
  onCreateGeovalla: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function DeviceListPanel({
  devices,
  wsConnected,
  refreshing,
  onRefresh,
  searchQuery,
  onSearchQueryChange,
  selectedDeviceId,
  onDeviceClick,
  showGeovallas,
  geovallasLoading,
  geovallaCount,
  onToggleGeovallas,
  geovallaDrawing,
  onCreateGeovalla,
  collapsed,
  onToggleCollapsed,
}: DeviceListPanelProps) {
  if (collapsed) {
    return (
      <div
        className="absolute top-4 left-4 z-10"
        style={{ zIndex: 10 }}
      >
        <Button
          onClick={onToggleCollapsed}
          variant="outline"
          size="sm"
          className="shadow-lg gap-2 bg-background/95 backdrop-blur-sm"
          aria-label="Mostrar dispositivos"
          title="Mostrar dispositivos"
        >
          <Car className="h-4 w-4" />
          <span className="rounded-full bg-primary text-primary-foreground flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-semibold">
            {devices.length}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-4 left-4 z-10 flex flex-col gap-3 w-[min(320px,calc(100vw-2rem))]"
      style={{ zIndex: 10 }}
    >
      <Card className="bg-background/95 backdrop-blur-sm shadow-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Car className="h-4 w-4" />
              Dispositivos
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                  wsConnected
                    ? "bg-green-500/15 text-green-600"
                    : "bg-red-500/15 text-red-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                {wsConnected ? "En vivo" : "Conectando…"}
              </span>
              <Button
                onClick={onRefresh}
                variant="outline"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                disabled={refreshing}
                aria-label="Refrescar posiciones"
                title="Refrescar posiciones"
              >
                <ArrowsClockwiseIcon
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                onClick={onToggleCollapsed}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label="Ocultar panel"
                title="Ocultar panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <InputGroup className="w-full">
            <InputGroupInput
              placeholder="Buscar dispositivo..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-sm"
            />
            <InputGroupAddon>
              <MagnifyingGlass className="h-4 w-4" />
            </InputGroupAddon>
          </InputGroup>
        </CardHeader>

        {devices.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground mb-2">
              {devices.length} dispositivo
              {devices.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
              {devices.map((device) => {
                const isSelected = selectedDeviceId === device.id;
                return (
                  <button
                    key={device.id}
                    onClick={() => onDeviceClick(device.id)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/60 hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {device.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs flex items-center gap-0.5 opacity-70">
                          <BatteryFull className="h-3 w-3" />
                          {fmtBattery(device.batteryLevel)}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            device.isOnline
                              ? "bg-green-500"
                              : "bg-gray-400 dark:bg-dark-text-muted"
                          }`}
                        />
                      </div>
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        isSelected
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {fmtTime(device.lastUpdate)}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        )}

        {devices.length === 0 && (
          <CardContent className="pb-4 pt-1 text-center">
            <p className="text-xs text-muted-foreground">
              {wsConnected
                ? "Esperando dispositivos…"
                : "Conectando al servidor…"}
            </p>
          </CardContent>
        )}

        <CardContent className="pt-0 pb-3 space-y-2">
          <Button
            onClick={onCreateGeovalla}
            variant={geovallaDrawing ? "default" : "outline"}
            size="sm"
            className="w-full text-xs"
          >
            <PencilSimpleLine className="h-3.5 w-3.5" />
            {geovallaDrawing ? "Dibujando…" : "Dibujar geovalla"}
          </Button>
          <Button
            onClick={onToggleGeovallas}
            variant={showGeovallas ? "default" : "outline"}
            size="sm"
            className="w-full text-xs"
            disabled={geovallasLoading}
          >
            <MapTrifoldIcon className="h-3.5 w-3.5" />
            {geovallasLoading
              ? "Cargando geovallas…"
              : showGeovallas
                ? "Ocultar geovallas"
                : "Mostrar geovallas"}
            {showGeovallas ? (
              <EyeSlashIcon className="h-3.5 w-3.5 ml-auto" />
            ) : (
              <EyeIcon className="h-3.5 w-3.5 ml-auto" />
            )}
          </Button>
          {showGeovallas && geovallaCount === 0 && !geovallasLoading && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              No hay geovallas registradas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}