"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "@phosphor-icons/react";
import type { DateRange, Matcher } from "react-day-picker";
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

function RangeCalendarField({
  label,
  value,
  disabledMatcher,
  defaultMonth,
  onSelect,
}: {
  label: string;
  value: Date | undefined;
  disabledMatcher: Matcher | undefined;
  defaultMonth: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleSelect = (date: Date | undefined) => {
    onSelect(date);
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
            <span className="text-muted-foreground">{label}:</span>
            {value ? format(value, "dd/MM/yyyy") : "Cualquiera"}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-2.5" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          defaultMonth={defaultMonth}
          disabled={disabledMatcher}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({ range, onRangeChange }: DateRangePickerProps) {
  const from = range?.from;
  const to = range?.to;

  const setFrom = (d: Date | undefined) =>
    onRangeChange({ from: d ?? undefined, to });
  const setTo = (d: Date | undefined) =>
    onRangeChange({ from, to: d ?? undefined });

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Rango de fechas
      </label>
      <div className="grid grid-cols-2 gap-2">
        <RangeCalendarField
          label="Inicio"
          value={from}
          disabledMatcher={to ? { after: to } : undefined}
          defaultMonth={from ?? to}
          onSelect={setFrom}
        />
        <RangeCalendarField
          label="Final"
          value={to}
          disabledMatcher={from ? { before: from } : undefined}
          defaultMonth={to ?? from}
          onSelect={setTo}
        />
      </div>
      {(from || to) && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => onRangeChange(undefined)}
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}