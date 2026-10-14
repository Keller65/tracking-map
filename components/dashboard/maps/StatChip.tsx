export function StatChip({
  icon,
  label,
  value,
  accent,
  mono = false,
  connected = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  mono?: boolean;
  connected?: boolean;
}) {
  const accentColor = connected === false ? "#ef4444" : accent;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span
          className="flex shrink-0 items-center"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1 truncate text-sm font-semibold leading-tight ${
          mono ? "font-mono tabular-nums" : ""
        }`}
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
