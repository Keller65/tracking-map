"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import axios from "axios"
import { Clock, Warning } from "@phosphor-icons/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface AgingItem {
  cardCode: string
  cardName: string
  days: number
  pending: number
}

interface AgingResponse {
  title: string
  slpCode: number
  asOf: string
  items: AgingItem[]
}

export default function AgingCard() {
  const { data: session } = useSession()
  const token = session?.user?.token ?? null
  const salesPersonCode = session?.user?.salesPersonCode ?? null
  const [data, setData] = useState<AgingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current || !salesPersonCode || !token) return
    calledRef.current = true

    const fetchData = async () => {
      try {
        const response = await axios.get<AgingResponse>(
          `/api-proxy/api/Kpi/aging-36-60/${salesPersonCode}?top=10`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )
        setData(response.data)
      } catch (error) {
        console.error("Error fetching aging data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [salesPersonCode, token])

  const totalPending = data?.items.reduce((sum, item) => sum + item.pending, 0) ?? 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-gray-500 dark:text-dark-text-secondary" />
          <p className="text-sm font-semibold text-gray-500 dark:text-dark-text-secondary">
            Facturas 36-60 días
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        ) : data?.items && data.items.length > 0 ? (
          <>
            <div className="mb-3">
              <p className="text-lg font-bold text-orange-600">
                {totalPending.toLocaleString("es-HN", { minimumFractionDigits: 2 })} HNL
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-text-muted">
                Total pendiente ({data.items.length} clientes)
              </p>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {data.items.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-700 dark:text-dark-text-primary">{item.cardName}</p>
                    <p className="text-gray-400 dark:text-dark-text-muted text-xs">{item.cardCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-orange-600">
                      {item.pending.toLocaleString("es-HN", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-dark-text-muted">{item.days} días</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-dark-text-muted text-xs">
            <Warning size={24} className="mb-2" />
            <p>Sin facturas pendientes</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}