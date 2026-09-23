import { format } from "date-fns";
import { es } from "date-fns/locale/es";

export const fmtBattery = (level: number): string =>
  `${level > 1 ? Math.round(level) : Math.round(level * 100)}%`;

export const fmtTime = (v: string | number): string =>
  format(new Date(v), "hh:mm:ss a", { locale: es });