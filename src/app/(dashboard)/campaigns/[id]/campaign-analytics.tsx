'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Mail,
  Eye,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
} from 'lucide-react'
import type { CampaignStats } from '@/lib/campaigns'

interface CampaignAnalyticsProps {
  campaignId: string
  stats: CampaignStats
}

interface StepAnalytics {
  step: number
  sent: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  openRate: number
  clickRate: number
  replyRate: number
}

interface DailyStats {
  date: string
  sent: number
  opened: number
  clicked: number
  replied: number
}

export function CampaignAnalytics({ campaignId, stats }: CampaignAnalyticsProps) {
  const [stepAnalytics, setStepAnalytics] = useState<StepAnalytics[]>([])
  const [_dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('7d')

  useEffect(() => {
    fetchAnalytics()
  }, [campaignId, timeRange])

  async function fetchAnalytics() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/analytics?range=${timeRange}`
      )
      if (response.ok) {
        const data = await response.json()
        setStepAnalytics(data.stepAnalytics || [])
        setDailyStats(data.dailyStats || [])
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPerformanceIndicator = (rate: number, benchmark: number) => {
    if (rate >= benchmark * 1.2) {
      return { icon: TrendingUp, color: 'text-green-500', label: 'Above average' }
    } else if (rate <= benchmark * 0.8) {
      return { icon: TrendingDown, color: 'text-red-500', label: 'Below average' }
    }
    return null
  }

  // Industry benchmarks (approximate)
  const benchmarks = {
    openRate: 20,
    clickRate: 2.5,
    replyRate: 5,
    bounceRate: 2,
  }

  if (loading) {
    return <AnalyticsSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Time Range Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campaign Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Performance metrics and insights
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="14d">Last 14 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Open Rate</span>
              {getPerformanceIndicator(stats.openRate, benchmarks.openRate) && (
                <Badge
                  variant="outline"
                  className={getPerformanceIndicator(stats.openRate, benchmarks.openRate)?.color}
                >
                  {getPerformanceIndicator(stats.openRate, benchmarks.openRate)?.label}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats.openRate}%</span>
              <span className="text-sm text-muted-foreground">
                ({stats.opened} of {stats.contacted})
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, stats.openRate)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Industry avg: {benchmarks.openRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Click Rate</span>
              {getPerformanceIndicator(stats.clickRate, benchmarks.clickRate) && (
                <Badge
                  variant="outline"
                  className={getPerformanceIndicator(stats.clickRate, benchmarks.clickRate)?.color}
                >
                  {getPerformanceIndicator(stats.clickRate, benchmarks.clickRate)?.label}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats.clickRate}%</span>
              <span className="text-sm text-muted-foreground">
                ({stats.clicked} clicks)
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, stats.clickRate * 10)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Industry avg: {benchmarks.clickRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Reply Rate</span>
              {getPerformanceIndicator(stats.replyRate, benchmarks.replyRate) && (
                <Badge
                  variant="outline"
                  className={getPerformanceIndicator(stats.replyRate, benchmarks.replyRate)?.color}
                >
                  {getPerformanceIndicator(stats.replyRate, benchmarks.replyRate)?.label}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats.replyRate}%</span>
              <span className="text-sm text-muted-foreground">
                ({stats.replied} replies)
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.min(100, stats.replyRate * 5)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Industry avg: {benchmarks.replyRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Bounce Rate</span>
              {stats.bounceRate > benchmarks.bounceRate && (
                <Badge variant="outline" className="text-red-500">
                  High
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats.bounceRate}%</span>
              <span className="text-sm text-muted-foreground">
                ({stats.bounced} bounced)
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${Math.min(100, stats.bounceRate * 10)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Target: under {benchmarks.bounceRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Step Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Step-by-Step Performance
          </CardTitle>
          <CardDescription>
            How each step in your sequence is performing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stepAnalytics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No step data yet. Start your campaign to see analytics.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {stepAnalytics.map((step) => (
                <div
                  key={step.step}
                  className="flex items-center gap-6 p-4 rounded-lg border"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                    {step.step}
                  </div>

                  <div className="flex-1 grid grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Sent</p>
                      <p className="text-lg font-semibold">{step.sent}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Opens</p>
                      <p className="text-lg font-semibold">
                        {step.opened}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({step.openRate}%)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Clicks</p>
                      <p className="text-lg font-semibold">
                        {step.clicked}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({step.clickRate}%)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Replies</p>
                      <p className="text-lg font-semibold">
                        {step.replied}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({step.replyRate}%)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bounced</p>
                      <p className="text-lg font-semibold text-red-500">
                        {step.bounced}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Funnel Analysis
          </CardTitle>
          <CardDescription>
            Lead progression through your campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Funnel bars */}
            <div className="space-y-3">
              <FunnelBar
                label="Total Leads"
                value={stats.totalLeads}
                percentage={100}
                color="bg-gray-400"
              />
              <FunnelBar
                label="Contacted"
                value={stats.contacted}
                percentage={stats.totalLeads > 0 ? (stats.contacted / stats.totalLeads) * 100 : 0}
                color="bg-blue-500"
              />
              <FunnelBar
                label="Opened"
                value={stats.opened}
                percentage={stats.totalLeads > 0 ? (stats.opened / stats.totalLeads) * 100 : 0}
                color="bg-green-500"
              />
              <FunnelBar
                label="Clicked"
                value={stats.clicked}
                percentage={stats.totalLeads > 0 ? (stats.clicked / stats.totalLeads) * 100 : 0}
                color="bg-yellow-500"
              />
              <FunnelBar
                label="Replied"
                value={stats.replied}
                percentage={stats.totalLeads > 0 ? (stats.replied / stats.totalLeads) * 100 : 0}
                color="bg-purple-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Performance Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.openRate < benchmarks.openRate && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                <Eye className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">
                    Low Open Rate
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Try A/B testing different subject lines. Personalization with the recipient&apos;s
                    name or company can boost opens by 26%.
                  </p>
                </div>
              </div>
            )}

            {stats.replyRate < benchmarks.replyRate && stats.openRate >= benchmarks.openRate && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                <MessageSquare className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Good Opens, Low Replies
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your subject lines are working, but the body might need work. Try a clearer
                    call-to-action or ask a direct question.
                  </p>
                </div>
              </div>
            )}

            {stats.bounceRate > benchmarks.bounceRate && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    High Bounce Rate
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Verify your lead list quality. High bounces can hurt your sender reputation.
                    Consider using email verification before sending.
                  </p>
                </div>
              </div>
            )}

            {stats.openRate >= benchmarks.openRate &&
              stats.replyRate >= benchmarks.replyRate &&
              stats.bounceRate <= benchmarks.bounceRate && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950">
                  <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-100">
                      Great Performance!
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Your campaign is performing above industry benchmarks. Keep up the good work
                      and consider scaling your outreach.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface FunnelBarProps {
  label: string
  value: number
  percentage: number
  color: string
}

function FunnelBar({ label, value, percentage, color }: FunnelBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">
          {value.toLocaleString()} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-8 rounded bg-muted overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500 flex items-center justify-end pr-2`}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-2 w-full mt-2" />
              <Skeleton className="h-3 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-6 p-4 rounded-lg border">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 grid grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j}>
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-6 w-16 mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
