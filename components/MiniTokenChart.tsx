'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, AreaSeries } from 'lightweight-charts'

interface MiniTokenChartProps {
  data: Array<{ time: number; value: number }>
  height?: number
  positive?: boolean
}

export default function MiniTokenChart({ data, height = 60, positive = true }: MiniTokenChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
      },
      width: chartContainerRef.current.clientWidth,
      height,
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      handleScroll: false,
      handleScale: false,
    })

    const color = positive ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color} / 0.4`,
      bottomColor: `${color} / 0.0`,
      lineWidth: 2,
    })

    areaSeries.setData(data)
    chart.timeScale().fitContent()

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
  }, [data, height, positive])

  return <div ref={chartContainerRef} className="w-full" />
}
