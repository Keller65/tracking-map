"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "@phosphor-icons/react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DateRangePickerProps = {
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
};

export function DateRangePicker({ range, onRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Date | undefined>(range?.from);
  const [to, setTo] = useState<Date | undefined>(range?.to);

  useEffect(() => {
    if (!open) {
      setFrom(range?.from);
      setTo(range?.to);
    }
  }, [open, range]);

  const label =
    from && to
      ? `Historial: ${format(from, "dd/MM/yyyy")} — ${format(to, "dd/MM/yyyy")}`
      : from
        ? `Historial: desde ${format(from, "dd/MM/yyyy")}`
        : "Historial: Todo el tiempo";

  const handleApply = () => {
    onRangeChange(from || to ? { from: from ?? undefined, to } : undefined);
    setOpen(false);
  };

  const handleClear = () => {
    setFrom(undefined);
    setTo(undefined);
    onRangeChange(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs font-normal"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {label}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-2.5" align="start">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Fecha inicio
            </span>
            <Calendar
              mode="single"
              selected={from}
              onSelect={setFrom}
              defaultMonth={from}
              disabled={to ? { after: to } : undefined}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Fecha final
            </span>
            <Calendar
              mode="single"
              selected={to}
              onSelect={setTo}
              defaultMonth={to ?? from}
              disabled={from ? { before: from } : undefined}
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={handleApply}
            disabled={!from && !to}
          >
            Aplicar
          </Button>
          {(from || to) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={handleClear}
            >
              Limpiar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}