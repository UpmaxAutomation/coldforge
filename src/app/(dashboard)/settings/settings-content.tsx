'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  User,
  Building2,
  Bell,
  Key,
  CreditCard,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  Loader2,
  Upload
} from 'lucide-react'

// Types
interface ProfileData {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  timezone: string
  role: 'owner' | 'admin' | 'member'
}

interface OrganizationData {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'agency'
  domain: string | null
  settings: {
    default_timezone?: string
    default_daily_limit?: number
  }
}

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  avatar_url: string | null
  created_at: string
}

interface NotificationSettings {
  campaign_alerts: boolean
  reply_notifications: boolean
  weekly_digest: boolean
  daily_summary: boolean
  bounce_alerts: boolean
  warmup_updates: boolean
}

interface ApiKey {
  id: string
  name: string
  key_preview: string
  created_at: string
  last_used_at: string | null
  is_active: boolean
}

interface BillingData {
  plan: 'starter' | 'pro' | 'agency'
  status: 'active' | 'past_due' | 'canceled'
  current_period_end: string | null
  usage: {
    emails_sent: number
    emails_limit: number
    accounts: number
    accounts_limit: number
    leads: number
    leads_limit: number
  }
}

// Timezone list
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export default function SettingsContent() {
  const [activeTab, setActiveTab] = useState('profile')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and organization settings
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-none lg:flex">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Organization</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="organization">
          <OrganizationTab />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="api">
          <ApiKeysTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Profile Tab Component
function ProfileTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [formData, setFormData] = useState({
    full_name: '',
    timezone: 'America/New_York',
  })

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/profile')
      const data = await response.json()
      if (data.profile) {
        setProfile(data.profile)
        setFormData({
          full_name: data.profile.full_name || '',
          timezone: data.profile.timezone || 'America/New_York',
        })
      }
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      toast.success('Profile updated successfully')
      fetchProfile()
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <ProfileSkeleton />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
          <CardDescription>
            Update your personal information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled>
                <Upload className="mr-2 h-4 w-4" />
                Upload Photo
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or GIF. Max 2MB.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Role</p>
              <p className="text-sm text-muted-foreground">
                Your role in the organization
              </p>
            </div>
            <Badge variant={profile?.role === 'owner' ? 'default' : 'secondary'}>
              {profile?.role}
            </Badge>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-6">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Separator />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

// Organization Tab Component
function OrganizationTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [organization, setOrganization] = useState<OrganizationData | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    default_timezone: 'America/New_York',
    default_daily_limit: 50,
  })

  const fetchOrganization = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/organization')
      const data = await response.json()
      if (data.organization) {
        setOrganization(data.organization)
        setTeamMembers(data.team_members || [])
        setFormData({
          name: data.organization.name || '',
          domain: data.organization.domain || '',
          default_timezone: data.organization.settings?.default_timezone || 'America/New_York',
          default_daily_limit: data.organization.settings?.default_daily_limit || 50,
        })
      }
    } catch {
      toast.error('Failed to load organization')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganization()
  }, [fetchOrganization])

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      toast.success('Organization updated successfully')
      fetchOrganization()
    } catch {
      toast.error('Failed to save organization')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <OrganizationSkeleton />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
          <CardDescription>
            Manage your organization details and defaults
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org_name">Organization Name</Label>
              <Input
                id="org_name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My Company"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org_slug">Slug</Label>
              <Input
                id="org_slug"
                value={organization?.slug || ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Organization identifier (cannot be changed)
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org_domain">Company Domain</Label>
              <Input
                id="org_domain"
                value={formData.domain}
                onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_timezone">Default Timezone</Label>
              <Select
                value={formData.default_timezone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, default_timezone: value }))}
              >
                <SelectTrigger id="default_timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_daily_limit">Default Daily Email Limit</Label>
            <Input
              id="default_daily_limit"
              type="number"
              min={1}
              max={500}
              value={formData.default_daily_limit}
              onChange={(e) => setFormData(prev => ({ ...prev, default_daily_limit: parseInt(e.target.value) || 50 }))}
            />
            <p className="text-xs text-muted-foreground">
              Default sending limit for new email accounts (1-500)
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage your team and their roles
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {teamMembers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No team members yet. Invite someone to get started.
              </p>
            ) : (
              teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback>
                        {member.full_name?.charAt(0) || member.email.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.full_name || member.email}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role}
                    </Badge>
                    {member.role !== 'owner' && (
                      <Button variant="ghost" size="icon" disabled>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function OrganizationSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

// Notifications Tab Component
function NotificationsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>({
    campaign_alerts: true,
    reply_notifications: true,
    weekly_digest: true,
    daily_summary: false,
    bounce_alerts: true,
    warmup_updates: false,
  })

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/notifications')
      const data = await response.json()
      if (data.settings) {
        setSettings(data.settings)
      }
    } catch {
      toast.error('Failed to load notification settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleToggle = async (key: keyof NotificationSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] }
    setSettings(newSettings)
    setSaving(true)

    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      toast.success('Notification settings updated')
    } catch {
      setSettings(settings) // Revert on error
      toast.error('Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <NotificationsSkeleton />
  }

  const notificationOptions = [
    {
      key: 'campaign_alerts' as const,
      title: 'Campaign Alerts',
      description: 'Get notified when campaigns start, pause, or complete',
    },
    {
      key: 'reply_notifications' as const,
      title: 'Reply Notifications',
      description: 'Instant notifications when leads reply to your emails',
    },
    {
      key: 'bounce_alerts' as const,
      title: 'Bounce Alerts',
      description: 'Get alerted when emails bounce or fail to deliver',
    },
    {
      key: 'warmup_updates' as const,
      title: 'Warmup Updates',
      description: 'Daily updates on your email warmup progress',
    },
    {
      key: 'daily_summary' as const,
      title: 'Daily Summary',
      description: 'Receive a daily summary of your campaign performance',
    },
    {
      key: 'weekly_digest' as const,
      title: 'Weekly Digest',
      description: 'Weekly overview of all your email campaigns',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose which notifications you want to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notificationOptions.map((option) => (
          <div key={option.key} className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">{option.title}</p>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </div>
            <Switch
              checked={settings[option.key]}
              onCheckedChange={() => handleToggle(option.key)}
              disabled={saving}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function NotificationsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-5 w-9" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// API Keys Tab Component
function ApiKeysTab() {
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [showNewKey, setShowNewKey] = useState<string | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

  const fetchApiKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/api-keys')
      const data = await response.json()
      if (data.api_keys) {
        setApiKeys(data.api_keys)
      }
    } catch {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApiKeys()
  }, [fetchApiKeys])

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create')
      }

      setShowNewKey(data.api_key.key)
      setNewKeyName('')
      fetchApiKeys()
      toast.success('API key created successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const deleteApiKey = async (id: string) => {
    try {
      const response = await fetch(`/api/settings/api-keys?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      toast.success('API key deleted')
      fetchApiKeys()
    } catch {
      toast.error('Failed to delete API key')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  if (loading) {
    return <ApiKeysSkeleton />
  }

  return (
    <div className="space-y-6">
      {showNewKey && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check className="h-5 w-5" />
              API Key Created
            </CardTitle>
            <CardDescription className="text-green-600 dark:text-green-500">
              Copy your API key now. You will not be able to see it again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-green-100 dark:bg-green-900 p-3 font-mono text-sm">
                {showNewKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(showNewKey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => setShowNewKey(null)}
            >
              I have saved my key
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create API Key</CardTitle>
          <CardDescription>
            Generate a new API key for programmatic access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="API key name (e.g., Production, Development)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createApiKey()}
            />
            <Button onClick={createApiKey} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your existing API keys
              </CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={fetchApiKeys}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No API keys yet. Create one above.
            </p>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{key.name}</p>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? 'Active' : 'Revoked'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm text-muted-foreground font-mono">
                        {visibleKeys[key.id] ? key.key_preview : `${key.key_preview.slice(0, 12)}${'*'.repeat(20)}`}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setVisibleKeys(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                      >
                        {visibleKeys[key.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used_at && ` | Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(key.key_preview)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteApiKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ApiKeysSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-28" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-48 mb-1" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// Billing Tab Component
function BillingTab() {
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<BillingData | null>(null)

  const fetchBilling = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/billing')
      const data = await response.json()
      if (data.billing) {
        setBilling(data.billing)
      }
    } catch {
      toast.error('Failed to load billing info')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  if (loading) {
    return <BillingSkeleton />
  }

  const planDetails = {
    starter: { name: 'Starter', price: 'Free', color: 'bg-gray-500' },
    pro: { name: 'Pro', price: '$49/mo', color: 'bg-blue-500' },
    agency: { name: 'Agency', price: '$149/mo', color: 'bg-purple-500' },
  }

  const currentPlan = billing?.plan || 'starter'
  const plan = planDetails[currentPlan]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            Manage your subscription and billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-6">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${plan.color}`} />
              <div>
                <p className="text-2xl font-bold">{plan.name}</p>
                <p className="text-muted-foreground">{plan.price}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={billing?.status === 'active' ? 'default' : 'destructive'}>
                {billing?.status || 'Active'}
              </Badge>
              {currentPlan !== 'agency' && (
                <Button>Upgrade Plan</Button>
              )}
            </div>
          </div>

          {billing?.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Current period ends on {new Date(billing.current_period_end).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Your current usage for this billing period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <UsageBar
            label="Emails Sent"
            current={billing?.usage?.emails_sent || 0}
            limit={billing?.usage?.emails_limit || 1000}
          />
          <UsageBar
            label="Email Accounts"
            current={billing?.usage?.accounts || 0}
            limit={billing?.usage?.accounts_limit || 3}
          />
          <UsageBar
            label="Leads"
            current={billing?.usage?.leads || 0}
            limit={billing?.usage?.leads_limit || 1000}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Comparison</CardTitle>
          <CardDescription>
            See what you get with each plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <PlanCard
              name="Starter"
              price="Free"
              features={[
                '3 Email Accounts',
                '1,000 Emails/month',
                '1,000 Leads',
                'Basic Analytics',
              ]}
              current={currentPlan === 'starter'}
            />
            <PlanCard
              name="Pro"
              price="$49/mo"
              features={[
                '15 Email Accounts',
                '10,000 Emails/month',
                '10,000 Leads',
                'Advanced Analytics',
                'API Access',
                'Email Warmup',
              ]}
              current={currentPlan === 'pro'}
              recommended
            />
            <PlanCard
              name="Agency"
              price="$149/mo"
              features={[
                'Unlimited Email Accounts',
                '50,000 Emails/month',
                'Unlimited Leads',
                'Full Analytics Suite',
                'Priority Support',
                'Custom Integrations',
              ]}
              current={currentPlan === 'agency'}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const percentage = Math.min((current / limit) * 100, 100)
  const isNearLimit = percentage >= 80
  const isOverLimit = percentage >= 100

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={isOverLimit ? 'text-destructive' : isNearLimit ? 'text-yellow-600' : 'text-muted-foreground'}>
          {current.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            isOverLimit ? 'bg-destructive' : isNearLimit ? 'bg-yellow-500' : 'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

function PlanCard({
  name,
  price,
  features,
  current,
  recommended
}: {
  name: string
  price: string
  features: string[]
  current?: boolean
  recommended?: boolean
}) {
  return (
    <div className={`rounded-lg border p-6 ${current ? 'border-primary' : ''} ${recommended ? 'ring-2 ring-primary' : ''}`}>
      {recommended && (
        <Badge className="mb-4">Recommended</Badge>
      )}
      <h3 className="text-lg font-bold">{name}</h3>
      <p className="text-2xl font-bold mt-2">{price}</p>
      <ul className="mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            {feature}
          </li>
        ))}
      </ul>
      {current ? (
        <Button variant="outline" className="w-full mt-6" disabled>
          Current Plan
        </Button>
      ) : (
        <Button variant={recommended ? 'default' : 'outline'} className="w-full mt-6">
          {price === 'Free' ? 'Downgrade' : 'Upgrade'}
        </Button>
      )}
    </div>
  )
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-3 w-3 rounded-full" />
                <div>
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-16 mt-1" />
                </div>
              </div>
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
