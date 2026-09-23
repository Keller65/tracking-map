export const fmtBattery = (level: number): string =>
  `${level > 1 ? Math.round(level) : Math.round(level * 100)}%`;

export const fmtTime = (v: string | number): string =>
  new Date(v).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });