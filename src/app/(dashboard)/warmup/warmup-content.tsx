'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Flame,
  Mail,
  TrendingUp,
  Shield,
  RefreshCw,
  Inbox,
  AlertTriangle,
  CheckCircle,
  Clock,
  MailOpen,
  Reply,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface WarmupStats {
  accountsWarming: number
  totalAccounts: number
  warmupSentToday: number
  avgReputationScore: number
  avgWarmupProgress: number
  inboxPlacementRate: number
  replyRate: number
}

interface ChartData {
  date: string
  sent: number
  replied: number
  opened: number
}

interface WarmupAccount {
  id: string
  email: string
  display_name: string | null
  provider: 'google' | 'microsoft' | 'smtp'
  warmup_enabled: boolean
  warmup_progress: number
  health_score: number
  status: 'active' | 'paused' | 'error' | 'warming'
  daily_limit: number
  sent_today: number
  inbox_placement_rate: number
  spam_rate: number
  warmup_stage: number
  warmup_days_active: number
  created_at: string
}

interface WarmupActivity {
  id: string
  from_email: string
  to_email: string
  subject: string | null
  status: 'sent' | 'delivered' | 'opened' | 'replied'
  sent_at: string
  opened_at: string | null
  replied_at: string | null
}

export default function WarmupContent() {
  const [_stats, setStats] = useState<WarmupStats | null>(null)
  const [_chartData, _setChartData] = useState<ChartData[]>([])
  const [accounts, setAccounts] = useState<WarmupAccount[]>([])
  const [activity, setActivity] = useState<WarmupActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingAccount, setTogglingAccount] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/warmup')
      const data = await response.json()
      if (data.overview) {
        // Transform from existing API format
        setStats({
          accountsWarming: data.overview.activeMailboxes || 0,
          totalAccounts: data.overview.totalMailboxes || 0,
          warmupSentToday: data.overview.totalSent || 0,
          avgReputationScore: data.overview.averageDeliverability || 0,
          avgWarmupProgress: data.overview.averageProgress || 0,
          inboxPlacementRate: data.overview.averageDeliverability || 0,
          replyRate: data.overview.averageReplyRate || 0,
        })
      }
    } catch (error) {
      console.error('Failed to fetch warmup stats:', error)
    }
  }, [])

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/warmup/accounts')
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
      }
    } catch (error) {
      console.error('Failed to fetch warmup accounts:', error)
    }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch('/api/warmup/activity?limit=20')
      const data = await response.json()
      if (data.activity) {
        setActivity(data.activity)
      }
    } catch (error) {
      console.error('Failed to fetch warmup activity:', error)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchAccounts(), fetchActivity()])
    setLoading(false)
  }, [fetchStats, fetchAccounts, fetchActivity])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const toggleWarmup = async (accountId: string, enabled: boolean) => {
    setTogglingAccount(accountId)
    try {
      const response = await fetch(`/api/warmup/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warmup_enabled: enabled }),
      })

      if (response.ok) {
        toast.success(enabled ? 'Warmup enabled' : 'Warmup paused')
        await fetchAccounts()
        await fetchStats()
      } else {
        toast.error('Failed to update warmup status')
      }
    } catch (error) {
      toast.error('Failed to update warmup status')
    } finally {
      setTogglingAccount(null)
    }
  }

  const getHealthIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="h-4 w-4 text-green-500" />
    if (score >= 50) return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    return <AlertTriangle className="h-4 w-4 text-red-500" />
  }

  const getHealthBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-800">Healthy</Badge>
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>
  }
  void getHealthBadge // Suppress unused warning - may be used in future

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'warming':
        return <Badge className="bg-orange-100 text-orange-800">Warming</Badge>
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>
      case 'paused':
        return <Badge variant="secondary">Paused</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getActivityIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Mail className="h-4 w-4 text-blue-500" />
      case 'delivered':
        return <Inbox className="h-4 w-4 text-green-500" />
      case 'opened':
        return <MailOpen className="h-4 w-4 text-purple-500" />
      case 'replied':
        return <Reply className="h-4 w-4 text-orange-500" />
      default:
        return <Mail className="h-4 w-4" />
    }
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const warmingAccounts = accounts.filter(a => a.warmup_enabled)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Warmup</h1>
          <p className="text-muted-foreground">
            Warm up your email accounts to improve deliverability and sender reputation
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts Warming</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {warmingAccounts.length}
              <span className="text-sm font-normal text-muted-foreground">
                /{accounts.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {accounts.length > 0
                ? `${Math.round((warmingAccounts.length / accounts.length) * 100)}% of accounts`
                : 'No accounts'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Reputation Score</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {warmingAccounts.length > 0
                ? Math.round(warmingAccounts.reduce((sum, a) => sum + a.health_score, 0) / warmingAccounts.length)
                : 0}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="mr-1 h-3 w-3 text-green-500" />
              <span>out of 100</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warmup Sent Today</CardTitle>
            <Mail className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {warmingAccounts.reduce((sum, a) => sum + a.sent_today, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              emails sent in warmup pool
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inbox Placement</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {warmingAccounts.length > 0
                ? Math.round(warmingAccounts.reduce((sum, a) => sum + a.inbox_placement_rate, 0) / warmingAccounts.length)
                : 0}%
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="mr-1 h-3 w-3 text-green-500" />
              <span>landing in inbox</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-10">
                <div className="flex items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ) : accounts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Email Accounts</CardTitle>
                <CardDescription>
                  Toggle warmup on/off for each account. Warmup gradually increases sending volume over 2-4 weeks.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Inbox Rate</TableHead>
                      <TableHead>Today</TableHead>
                      <TableHead className="text-right">Warmup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{account.email}</span>
                            <span className="text-xs text-muted-foreground capitalize">
                              {account.provider}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(account.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Stage {account.warmup_stage}/6
                              </span>
                              <span className="text-xs font-medium">
                                {account.warmup_progress}%
                              </span>
                            </div>
                            <Progress value={account.warmup_progress} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getHealthIcon(account.health_score)}
                            <span>{account.health_score}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {account.inbox_placement_rate >= 80 ? (
                              <ArrowUpRight className="h-3 w-3 text-green-500" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-red-500" />
                            )}
                            <span>{account.inbox_placement_rate}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {account.sent_today}/{account.daily_limit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={account.warmup_enabled}
                            disabled={togglingAccount === account.id}
                            onCheckedChange={(checked) => toggleWarmup(account.id, checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No email accounts</CardTitle>
                <CardDescription>
                  Connect email accounts first to start warming them up.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <a href="/accounts">Add Email Accounts</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Warmup Health Summary */}
          {warmingAccounts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Warmup Pool Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Active accounts</span>
                    <span className="font-medium">{warmingAccounts.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Daily capacity</span>
                    <span className="font-medium">
                      {warmingAccounts.reduce((sum, a) => sum + a.daily_limit, 0)} emails
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Healthy accounts</span>
                    <span className="font-medium">
                      {warmingAccounts.filter(a => a.health_score >= 80).length}/{warmingAccounts.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Est. completion</span>
                    <span className="font-medium">
                      {Math.max(...warmingAccounts.map(a => Math.ceil((100 - a.warmup_progress) / 4)))} days
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Warmup Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { stage: 1, days: '1-3', limit: 5, desc: 'Initial warmup' },
                    { stage: 2, days: '4-7', limit: 10, desc: 'Building reputation' },
                    { stage: 3, days: '8-12', limit: 20, desc: 'Increasing volume' },
                    { stage: 4, days: '13-19', limit: 35, desc: 'Moderate volume' },
                    { stage: 5, days: '20-26', limit: 50, desc: 'High volume' },
                    { stage: 6, days: '27+', limit: 75, desc: 'Maintenance' },
                  ].map((stage) => (
                    <div key={stage.stage} className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {stage.stage}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">Day {stage.days}</span>
                        <span className="text-muted-foreground"> - {stage.limit} emails/day</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Warmup Activity</CardTitle>
              <CardDescription>
                Track warmup emails sent, opened, and replied across your accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length > 0 ? (
                <div className="space-y-4">
                  {activity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 rounded-lg border p-3"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        {getActivityIcon(item.status)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{item.from_email}</span>
                          <span className="text-muted-foreground text-xs">to</span>
                          <span className="font-medium text-sm">{item.to_email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatRelativeTime(item.sent_at)}</span>
                          <span>-</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                      {item.replied_at && (
                        <Badge className="bg-green-100 text-green-800">Replied</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No warmup activity yet. Enable warmup on your accounts to get started.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warmup Schedule Configuration</CardTitle>
              <CardDescription>
                Warmup emails are sent automatically during business hours (8 AM - 6 PM)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="font-medium">How Warmup Works</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <span>Emails are sent between your accounts in the warmup pool</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <span>Automatic replies and engagement build reputation</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <span>Volume gradually increases over 4-6 weeks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                      <span>Emails are moved from spam to inbox automatically</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium">Best Practices</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <span>Run warmup for at least 2 weeks before cold outreach</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <span>Keep warmup running even during active campaigns</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <span>More accounts = better warmup pool effectiveness</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <span>Maintain a reputation score above 80 for best results</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Sending Window</p>
                    <p className="text-sm text-muted-foreground">
                      8:00 AM - 6:00 PM (your timezone) with randomized intervals
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
