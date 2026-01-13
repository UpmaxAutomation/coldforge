'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Send,
  Users,
  Mail,
  TrendingUp,
  Plus,
  Upload,
  Rocket,
  ArrowRight,
  BarChart3,
  Target
} from 'lucide-react'

interface DashboardStats {
  totalCampaigns: number
  activeCampaigns: number
  totalLeads: number
  emailAccounts: number
  warmingAccounts: number
  emailsSentToday: number
  replyRate: number
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function QuickActionSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-9 w-20" />
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        setLoading(true)
        setError(null)

        // Fetch all stats in parallel
        const [campaignsRes, leadsRes, accountsRes] = await Promise.all([
          fetch('/api/campaigns?limit=1'),
          fetch('/api/leads?limit=1'),
          fetch('/api/email-accounts'),
        ])

        // Parse responses
        const campaignsData = campaignsRes.ok ? await campaignsRes.json() : null
        const leadsData = leadsRes.ok ? await leadsRes.json() : null
        const accountsData = accountsRes.ok ? await accountsRes.json() : null

        // Calculate stats
        const accounts = accountsData?.accounts || []
        const warmingAccounts = accounts.filter((a: { warmup_enabled: boolean }) => a.warmup_enabled).length

        // Calculate emails sent today and reply rate from campaign stats
        let emailsSentToday = 0
        let totalReplies = 0
        let totalSent = 0

        if (campaignsData?.campaigns) {
          for (const campaign of campaignsData.campaigns) {
            if (campaign.stats) {
              totalSent += campaign.stats.sent || 0
              totalReplies += campaign.stats.replied || 0
            }
          }
        }

        const replyRate = totalSent > 0 ? (totalReplies / totalSent) * 100 : 0

        setStats({
          totalCampaigns: campaignsData?.pagination?.total || 0,
          activeCampaigns: campaignsData?.campaigns?.filter((c: { status: string }) => c.status === 'active').length || 0,
          totalLeads: leadsData?.pagination?.total || 0,
          emailAccounts: accounts.length,
          warmingAccounts,
          emailsSentToday,
          replyRate,
        })
      } catch (err) {
        console.error('Error fetching dashboard stats:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardStats()
  }, [])

  const quickActions = [
    {
      icon: Mail,
      title: 'Add Email Accounts',
      description: 'Connect your Google or Microsoft accounts',
      href: '/accounts',
      buttonText: 'Add Account',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      icon: Upload,
      title: 'Import Leads',
      description: 'Upload a CSV with your prospects',
      href: '/leads',
      buttonText: 'Import',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: Rocket,
      title: 'Create Campaign',
      description: 'Set up your first email sequence',
      href: '/campaigns',
      buttonText: 'Create',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to InstantScale. Your cold email command center.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            {/* Total Campaigns */}
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
              onClick={() => router.push('/campaigns')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCampaigns || 0}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {stats?.activeCampaigns || 0} active
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </CardContent>
            </Card>

            {/* Total Leads */}
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
              onClick={() => router.push('/leads')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalLeads?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Click to manage leads
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </CardContent>
            </Card>

            {/* Email Accounts */}
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
              onClick={() => router.push('/accounts')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Email Accounts</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.emailAccounts || 0}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {stats?.warmingAccounts || 0} warming up
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </CardContent>
            </Card>

            {/* Emails Sent Today */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.replyRate?.toFixed(1) || 0}%</div>
                <p className="text-xs text-muted-foreground">
                  Industry avg: 1-5%
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Your email sending activity for the past 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[300px] space-y-4">
                <Skeleton className="h-full w-full" />
              </div>
            ) : stats?.totalCampaigns === 0 ? (
              <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                <Send className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-center">No activity yet.</p>
                <p className="text-center text-sm">Start by adding email accounts and creating a campaign.</p>
                <Button
                  className="mt-4"
                  onClick={() => router.push('/campaigns')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              </div>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-center">Activity chart coming soon</p>
                <p className="text-center text-sm">
                  You have {stats?.totalCampaigns} campaign(s) and {stats?.totalLeads?.toLocaleString()} leads
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Get started with InstantScale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <>
                <QuickActionSkeleton />
                <QuickActionSkeleton />
                <QuickActionSkeleton />
              </>
            ) : (
              quickActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group"
                >
                  <div className={`flex-shrink-0 w-10 h-10 ${action.bgColor} rounded-full flex items-center justify-center`}>
                    <action.icon className={`h-5 w-5 ${action.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{action.title}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {action.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(action.href)}
                    className="flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  >
                    {action.buttonText}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Emails Sent Today</p>
                <p className="text-3xl font-bold mt-1">{stats?.emailsSentToday || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Send className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Campaigns</p>
                <p className="text-3xl font-bold mt-1">{stats?.activeCampaigns || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Warming Accounts</p>
                <p className="text-3xl font-bold mt-1">{stats?.warmingAccounts || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
