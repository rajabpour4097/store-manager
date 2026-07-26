import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatCompactMoney, formatNumber, toPersianDigits } from '@/utils/format'

export const CHART_COLORS = [
  '#3563ff',
  '#14b8a6',
  '#f59e0b',
  '#f43f5e',
  '#a855f7',
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
  '#6366f1',
  '#eab308',
]

const AXIS_STYLE = { fontSize: 11, fill: '#8592bd', fontFamily: 'Vazirmatn' }

const tooltipProps = {
  contentStyle: {
    borderRadius: 12,
    fontFamily: 'Vazirmatn',
    fontSize: 12,
    padding: '8px 12px',
  },
  labelStyle: { color: '#515b88', marginBottom: 4 },
  formatter: (value: number | string, name: string) =>
    [formatNumber(value), name] as [string, string],
}

function compactTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${toPersianDigits((value / 1_000_000_000).toFixed(1))} م.د`
  if (abs >= 1_000_000) return `${toPersianDigits((value / 1_000_000).toFixed(0))} م`
  if (abs >= 1_000) return `${toPersianDigits((value / 1_000).toFixed(0))} ه`
  return toPersianDigits(value)
}

export interface SeriesConfig {
  key: string
  label: string
  color?: string
}

interface ChartProps {
  data: Array<Record<string, unknown>>
  xKey: string
  series: SeriesConfig[]
  height?: number
  money?: boolean
  stacked?: boolean
}

export function TrendAreaChart({ data, xKey, series, height = 280, money = true }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.key} id={`grad-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0.02}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} reversed />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          orientation="right"
          tickFormatter={money ? compactTick : (value: number) => toPersianDigits(value)}
          width={58}
        />
        <Tooltip {...tooltipProps} />
        <Legend
          wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: 12, direction: 'rtl' }}
          iconType="circle"
          iconSize={8}
        />
        {series.map((item, index) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            fill={`url(#grad-${item.key})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function GroupedBarChart({
  data,
  xKey,
  series,
  height = 280,
  money = true,
  stacked = false,
}: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} reversed />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          orientation="right"
          tickFormatter={money ? compactTick : (value: number) => toPersianDigits(value)}
          width={58}
        />
        <Tooltip {...tooltipProps} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend
          wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: 12, direction: 'rtl' }}
          iconType="circle"
          iconSize={8}
        />
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            radius={[6, 6, 0, 0]}
            stackId={stacked ? 'stack' : undefined}
            maxBarSize={38}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SimpleLineChart({ data, xKey, series, height = 280, money = false }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_STYLE} tickLine={false} axisLine={false} reversed />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          orientation="right"
          tickFormatter={money ? compactTick : (value: number) => toPersianDigits(value)}
          width={52}
        />
        <Tooltip {...tooltipProps} />
        {series.map((item, index) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

interface DonutProps {
  data: Array<{ name: string; value: number }>
  height?: number
  money?: boolean
}

export function DonutChart({ data, height = 260, money = true }: DonutProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipProps} />
          <Legend
            wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: 11, direction: 'rtl' }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
        <span className="text-[11px] text-ink-400">مجموع</span>
        <span className="num text-sm font-bold text-ink-800 dark:text-ink-100">
          {money ? formatCompactMoney(total, '') : formatNumber(total)}
        </span>
      </div>
    </div>
  )
}
