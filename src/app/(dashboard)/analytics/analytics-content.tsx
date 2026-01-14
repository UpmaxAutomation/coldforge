'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Mail, Eye, MousePointer, Reply, AlertTriangle, TrendingUp } from 'lucide-react'

interface DailyStats {
  date: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

interface SummaryStats {
  totalSent: number
  totalDelivered: number
  totalOpened: number
  totalClicked: number
  totalReplied: number
  totalBounced: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  deliveryRate: number
}

interface HourlyStats {
  hour: number
  dayOfWeek: number
  count: number
  openRate: number
}

interface ReplyCategory {
  name: string
  value: number
  key: string
}

interface CampaignAnalytics {
  id: string
  name: string
  status: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  openRate: number
  clickRate: number
  replyRate: number
  bounceRate: number
  startedAt: string | null
}

interface AnalyticsData {
  summary: SummaryStats
  dailyBreakdown: DailyStats[]
  heatmapData: HourlyStats[]
  replyCategories: ReplyCategory[]
  period: string
}

interface CampaignsData {
  campaigns: CampaignAnalytics[]
}

// Modern chart colors - purple/blue theme
const CHART_COLORS = {
  primary: '#8b5cf6', // violet-500
  secondary: '#3b82f6', // blue-500
  accent: '#06b6d4', // cyan-500
  success: '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  danger: '#ef4444', // red-500
  muted: '#6b7280', // gray-500
}

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b']

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function AnalyticsContent() {
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [campaignsData, setCampaignsData] = useState<CampaignsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [analyticsRes, campaignsRes] = await Promise.all([
        fetch(`/api/analytics?period=${period}`),
        fetch(`/api/analytics/campaigns?period=${period}&limit=10`),
      ])

      if (!analyticsRes.ok || !campaignsRes.ok) {
        throw new Error('Failed to fetch analytics data')
      }

      const [analytics, campaigns] = await Promise.all([
        analyticsRes.json(),
        campaignsRes.json(),
      ])

      setAnalyticsData(analytics)
      setCampaignsData(campaigns)
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      draft: 'secondary',
      paused: 'outline',
      completed: 'secondary',
      archived: 'outline',
    }
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>
  }

  if (loading) {
    return <AnalyticsSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const summary = analyticsData?.summary || {
    totalSent: 0,
    totalDelivered: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalReplied: 0,
    totalBounced: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    bounceRate: 0,
    deliveryRate: 0,
  }

  const dailyBreakdown = analyticsData?.dailyBreakdown || []
  const replyCategories = analyticsData?.replyCategories || []
  const campaigns = campaignsData?.campaigns || []
  const heatmapData = analyticsData?.heatmapData || []

  // Check if there's any data
  const hasData = summary.totalSent > 0

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Track your campaign performance and deliverability
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          title="Total Sent"
          value={summary.totalSent.toLocaleString()}
          subtext="Emails sent"
          icon={Mail}
          iconColor="text-violet-500"
        />
        <MetricCard
          title="Open Rate"
          value={`${summary.openRate}%`}
          subtext="Industry avg: 15-25%"
          icon={Eye}
          iconColor="text-blue-500"
          trend={summary.openRate >= 20 ? 'up' : summary.openRate >= 15 ? 'neutral' : 'down'}
        />
        <MetricCard
          title="Click Rate"
          value={`${summary.clickRate}%`}
          subtext="Industry avg: 2-5%"
          icon={MousePointer}
          iconColor="text-cyan-500"
          trend={summary.clickRate >= 3 ? 'up' : summary.clickRate >= 2 ? 'neutral' : 'down'}
        />
        <MetricCard
          title="Reply Rate"
          value={`${summary.replyRate}%`}
          subtext="Industry avg: 1-5%"
          icon={Reply}
          iconColor="text-emerald-500"
          trend={summary.replyRate >= 3 ? 'up' : summary.replyRate >= 1 ? 'neutral' : 'down'}
        />
        <MetricCard
          title="Bounce Rate"
          value={`${summary.bounceRate}%`}
          subtext="Keep below 2%"
          icon={AlertTriangle}
          iconColor="text-amber-500"
          trend={summary.bounceRate <= 1 ? 'up' : summary.bounceRate <= 2 ? 'neutral' : 'down'}
        />
      </div>

      {/* Performance Over Time Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Over Time</CardTitle>
          <CardDescription>
            Daily breakdown of sends, opens, clicks, and replies
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={dailyBreakdown}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClicked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#f9fafb',
                  }}
                  labelFormatter={(label) => formatDate(label as string)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSent)"
                  name="Sent"
                />
                <Area
                  type="monotone"
                  dataKey="opened"
                  stroke={CHART_COLORS.secondary}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOpened)"
                  name="Opened"
                />
                <Area
                  type="monotone"
                  dataKey="clicked"
                  stroke={CHART_COLORS.accent}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorClicked)"
                  name="Clicked"
                />
                <Area
                  type="monotone"
                  dataKey="replied"
                  stroke={CHART_COLORS.success}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorReplied)"
                  name="Replied"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No email data yet. Start sending campaigns to see performance over time." />
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout: Campaign Comparison + Reply Categories */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Campaign Comparison Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Comparison</CardTitle>
            <CardDescription>Performance metrics by campaign</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={campaigns.slice(0, 6)}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#9ca3af"
                    fontSize={11}
                    width={100}
                    tickFormatter={(value) =>
                      value.length > 15 ? `${value.slice(0, 15)}...` : value
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f9fafb',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="sent" fill={CHART_COLORS.primary} name="Sent" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="opened" fill={CHART_COLORS.secondary} name="Opened" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="replied" fill={CHART_COLORS.success} name="Replied" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No campaign data available." />
            )}
          </CardContent>
        </Card>

        {/* Reply Categories Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Reply Categories</CardTitle>
            <CardDescription>Breakdown of reply types received</CardDescription>
          </CardHeader>
          <CardContent>
            {replyCategories.some((c) => c.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={replyCategories.filter((c) => c.value > 0) as Array<{ name: string; value: number; key: string }>}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                    label={(props) => {
                      const { name, percent } = props as { name: string; percent: number }
                      return `${name} ${Math.round(percent * 100)}%`
                    }}
                    labelLine={false}
                  >
                    {replyCategories
                      .filter((c) => c.value > 0)
                      .map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f9fafb',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No replies categorized yet." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Time Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Best Send Times</CardTitle>
          <CardDescription>
            Open rates by hour of day and day of week. Darker colors indicate higher open rates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-1">
                  {/* Header row with hours */}
                  <div className="h-6" />
                  {Array.from({ length: 24 }, (_, i) => (
                    <div
                      key={`hour-${i}`}
                      className="h-6 text-xs text-muted-foreground flex items-center justify-center"
                    >
                      {i}
                    </div>
                  ))}

                  {/* Day rows */}
                  {DAYS_OF_WEEK.map((day, dayIndex) => (
                    <>
                      <div
                        key={`day-${dayIndex}`}
                        className="h-8 text-xs text-muted-foreground flex items-center"
                      >
                        {day}
                      </div>
                      {Array.from({ length: 24 }, (_, hourIndex) => {
                        const cell = heatmapData.find(
                          (h) => h.dayOfWeek === dayIndex && h.hour === hourIndex
                        )
                        const openRate = cell?.openRate || 0
                        const count = cell?.count || 0
                        const opacity = count === 0 ? 0.1 : Math.min(0.2 + (openRate / 100) * 0.8, 1)

                        return (
                          <div
                            key={`cell-${dayIndex}-${hourIndex}`}
                            className="h-8 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-violet-400"
                            style={{
                              backgroundColor: `rgba(139, 92, 246, ${opacity})`,
                            }}
                            title={`${day} ${hourIndex}:00 - ${count} emails, ${openRate}% open rate`}
                          />
                        )
                      })}
                    </>
                  ))}
                </div>
                <div className="flex items-center justify-end mt-4 gap-2">
                  <span className="text-xs text-muted-foreground">Lower open rate</span>
                  <div className="flex gap-1">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((opacity) => (
                      <div
                        key={opacity}
                        className="w-4 h-4 rounded-sm"
                        style={{ backgroundColor: `rgba(139, 92, 246, ${opacity})` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Higher open rate</span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="Send some emails to see optimal send times." />
          )}
        </CardContent>
      </Card>

      {/* Top Performing Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Campaigns</CardTitle>
          <CardDescription>Detailed metrics for your campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Open Rate</TableHead>
                  <TableHead className="text-right">Click Rate</TableHead>
                  <TableHead className="text-right">Reply Rate</TableHead>
                  <TableHead className="text-right">Bounce Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell className="text-right">
                      {campaign.sent.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          campaign.openRate >= 20
                            ? 'text-emerald-500'
                            : campaign.openRate >= 15
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                        }
                      >
                        {campaign.openRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          campaign.clickRate >= 3
                            ? 'text-emerald-500'
                            : campaign.clickRate >= 2
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                        }
                      >
                        {campaign.clickRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          campaign.replyRate >= 3
                            ? 'text-emerald-500'
                            : campaign.replyRate >= 1
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                        }
                      >
                        {campaign.replyRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          campaign.bounceRate <= 1
                            ? 'text-emerald-500'
                            : campaign.bounceRate <= 2
                            ? 'text-amber-500'
                            : 'text-red-500'
                        }
                      >
                        {campaign.bounceRate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="No campaigns yet. Create a campaign to see detailed metrics." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  title,
  value,
  subtext,
  icon: Icon,
  iconColor,
  trend,
}: {
  title: string
  value: string
  subtext: string
  icon: typeof Mail
  iconColor: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {trend && (
            <TrendingUp
              className={`h-4 w-4 ${
                trend === 'up'
                  ? 'text-emerald-500'
                  : trend === 'down'
                  ? 'text-red-500 rotate-180'
                  : 'text-amber-500 rotate-90'
              }`}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      <p>{message}</p>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
