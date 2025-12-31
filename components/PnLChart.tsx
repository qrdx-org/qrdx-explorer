'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, AreaSeries } from 'lightweight-charts'
import { PnLDataPoint } from '@/lib/types'

interface PnLChartProps {
  data: PnLDataPoint[]
  height?: number
}

export default function PnLChart({ data, height = 300 }: PnLChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'hsl(215 20.2% 65.1%)',
      },
      width: chartContainerRef.current.clientWidth,
      height,
      grid: {
        vertLines: { color: 'hsl(217 33% 24% / 0.3)' },
        horzLines: { color: 'hsl(217 33% 24% / 0.3)' },
      },
      timeScale: {
        borderColor: 'hsl(217 33% 24%)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'hsl(217 33% 24%)',
      },
    })

    // Add area series using v5 API with AreaSeries type
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: 'hsl(217 91% 60%)',
      topColor: 'hsl(217 91% 60% / 0.4)',
      bottomColor: 'hsl(217 91% 60% / 0.0)',
      lineWidth: 2,
    })

    areaSeries.setData(data)

    // Fit content
    chart.timeScale().fitContent()

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [data, height])

  return (
    <div ref={chartContainerRef} className="w-full" />
  )
}
