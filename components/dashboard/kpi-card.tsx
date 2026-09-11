"use client"

import { Card, CardContent } from "@/components/ui/card"

export function KpiCard({ icon: Icon, label, value, delta }: { icon: any; label: string; value: string; delta?: number }) {
  const isDown = delta != null && delta < 0
  return (
    <Card className="relative overflow-hidden py-0 dark:bg-dark-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary truncate">{label}</p>
            <p className="text-base font-bold mt-0.5 dark:text-dark-text-primary">{value}</p>
            {delta != null && (
              <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${isDown ? "text-red-500" : "text-green-600"}`}>
                {isDown ? "↓" : "↑"} {Math.abs(delta).toFixed(2)}% vs. periodo anterior
              </p>
            )}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Icon className="size-4.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
