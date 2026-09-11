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
  const bgClass = connected === false
    ? "bg-red-50 dark:bg-red-400/10"
    : "bg-muted/50";
  const textClass = connected === false
    ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";
  const valueStyle = connected === false
    ? { color: "#ef4444" }
    : { color: accent ?? "inherit" };

  return (
    <div className={`${bgClass} rounded-lg p-2 space-y-0.5`}>
      <div className={`flex items-center gap-1 text-xs ${textClass} uppercase tracking-wide`}>
        {icon}
        {label}
      </div>
      <p
        className={`text-xs font-semibold leading-tight truncate ${mono ? "font-mono" : ""
          }`}
        style={valueStyle}
      >
        {value}
      </p>
    </div>
  );
}