'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Mail,
  Users,
  BarChart3,
  Eye,
  MousePointer,
  MessageSquare,
  AlertCircle,
  Layers
} from 'lucide-react'
import { toast } from 'sonner'
import { SequenceEditor } from './sequence-editor'
import { CampaignLeads } from './campaign-leads'
import { CampaignSettings } from './campaign-settings'
import { CampaignAnalytics } from './campaign-analytics'
import type { Campaign, CampaignStats } from '@/lib/campaigns'

interface CampaignData {
  id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
  type: string
  settings: Record<string, unknown>
  stats: CampaignStats
  leadListIds: string[]
  mailboxIds: string[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  pausedAt?: string
  completedAt?: string
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('sequence')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (campaignId) {
      fetchCampaign()
    }
  }, [campaignId])

  async function fetchCampaign() {
    setLoading(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`)
      if (response.ok) {
        const data = await response.json()
        setCampaign(data.campaign)
      } else if (response.status === 404) {
        toast.error('Campaign not found')
        router.push('/campaigns')
      } else {
        toast.error('Failed to load campaign')
      }
    } catch (error) {
      console.error('Failed to fetch campaign:', error)
      toast.error('Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  async function updateCampaignStatus(status: string) {
    setUpdating(true)
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status === 'active' ? 'start' : 'pause' }),
      })

      if (response.ok) {
        const data = await response.json()
        setCampaign(prev => prev ? { ...prev, status: data.campaign.status } : null)
        toast.success(`Campaign ${status === 'active' ? 'started' : 'paused'}`)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update campaign')
      }
    } catch (error) {
      console.error('Failed to update campaign status:', error)
      toast.error('Failed to update campaign')
    } finally {
      setUpdating(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500'
      case 'paused': return 'bg-yellow-500'
      case 'completed': return 'bg-blue-500'
      case 'draft': return 'bg-gray-500'
      case 'archived': return 'bg-gray-400'
      default: return 'bg-gray-500'
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default'
      case 'paused': return 'secondary'
      case 'completed': return 'outline'
      case 'draft': return 'secondary'
      default: return 'secondary'
    }
  }

  if (loading) {
    return <CampaignDetailSkeleton />
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Campaign not found</h2>
        <p className="text-muted-foreground">The campaign you're looking for doesn't exist.</p>
        <Button asChild>
          <Link href="/campaigns">Go Back to Campaigns</Link>
        </Button>
      </div>
    )
  }

  const stats = campaign.stats || {
    totalLeads: 0,
    contacted: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    bounceRate: 0
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/campaigns">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(campaign.status)}`} />
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant={getStatusBadgeVariant(campaign.status)}>
                {campaign.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Created {new Date(campaign.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {campaign.status === 'active' ? (
            <Button
              variant="outline"
              onClick={() => updateCampaignStatus('paused')}
              disabled={updating}
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause Campaign
            </Button>
          ) : campaign.status !== 'completed' && campaign.status !== 'archived' ? (
            <Button
              onClick={() => updateCampaignStatus('active')}
              disabled={updating}
            >
              <Play className="mr-2 h-4 w-4" />
              Start Campaign
            </Button>
          ) : null}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {stats.contacted} contacted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.opened} opened
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.clickRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.clicked} clicked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.replyRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.replied} replies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bounceRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.bounced} bounced
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="sequence" className="gap-2">
            <Layers className="h-4 w-4" />
            Sequence
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Users className="h-4 w-4" />
            Leads
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sequence" className="space-y-4">
          <SequenceEditor
            campaignId={campaignId}
            isEditable={campaign.status === 'draft' || campaign.status === 'paused'}
          />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <CampaignLeads campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <CampaignSettings
            campaignId={campaignId}
            settings={campaign.settings}
            onUpdate={(settings) => setCampaign(prev => prev ? { ...prev, settings } : null)}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <CampaignAnalytics campaignId={campaignId} stats={stats} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CampaignDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    </div>
  )
}
