'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AccountCard } from '@/components/email-accounts/account-card'
import { GoogleConnectButton } from '@/components/email-accounts/google-connect'
import { MicrosoftConnectButton } from '@/components/email-accounts/microsoft-connect'
import { SmtpConnectDialog } from '@/components/email-accounts/smtp-connect'
import { Plus, Mail, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface EmailAccount {
  id: string
  email: string
  provider: string
  display_name: string
  daily_limit: number
  is_active: boolean
  warmup_enabled: boolean
  health_score: number
  created_at: string
}

export default function AccountsContent() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showConnect, setShowConnect] = useState(false)
  const searchParams = useSearchParams()

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/email-accounts')
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
      }
    } catch {
      toast.error('Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  // Handle OAuth callbacks
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'google_connected') {
      toast.success('Google account connected successfully')
      fetchAccounts()
    } else if (success === 'microsoft_connected') {
      toast.success('Microsoft account connected successfully')
      fetchAccounts()
    }

    if (error) {
      toast.error('Connection failed', {
        description: decodeURIComponent(error),
      })
    }
  }, [searchParams])

  const activeAccounts = accounts.filter(a => a.is_active)
  const totalDailyLimit = accounts.reduce((sum, a) => sum + (a.is_active ? a.daily_limit : 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Accounts</h1>
          <p className="text-muted-foreground">
            Connect and manage your email accounts for sending campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchAccounts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setShowConnect(!showConnect)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeAccounts.length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Capacity</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDailyLimit.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">emails per day</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warming Up</CardTitle>
            <Mail className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {accounts.filter(a => a.warmup_enabled).length}
            </div>
            <p className="text-xs text-muted-foreground">accounts in warmup</p>
          </CardContent>
        </Card>
      </div>

      {/* Connect Account Section */}
      {showConnect && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Email Account</CardTitle>
            <CardDescription>
              Choose how you want to connect your email account
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <GoogleConnectButton />
            <MicrosoftConnectButton />
            <SmtpConnectDialog onSuccess={() => {
              fetchAccounts()
              setShowConnect(false)
            }} />
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-6 w-20 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onUpdate={fetchAccounts}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No email accounts</CardTitle>
            <CardDescription>
              Connect your first email account to start sending campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowConnect(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Account
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
