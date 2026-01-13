'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreVertical, Trash2, RefreshCw, Mail, Check, X } from 'lucide-react'
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

interface AccountCardProps {
  account: EmailAccount
  onUpdate: () => void
}

const providerLabels: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  smtp: 'SMTP',
}

const providerColors: Record<string, string> = {
  google: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  microsoft: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  smtp: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export function AccountCard({ account, onUpdate }: AccountCardProps) {
  const [testing, setTesting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      const response = await fetch(`/api/email-accounts/${account.id}`, {
        method: 'POST',
      })
      const data = await response.json()

      if (data.success) {
        toast.success('Connection successful', {
          description: `Connected to ${data.email || account.email}`,
        })
      } else {
        toast.error('Connection failed', {
          description: data.error || 'Unknown error',
        })
      }
      onUpdate()
    } catch (error) {
      toast.error('Test failed', {
        description: 'Could not connect to the server',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleToggleActive = async () => {
    try {
      const response = await fetch(`/api/email-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !account.is_active }),
      })

      if (response.ok) {
        toast.success(account.is_active ? 'Account deactivated' : 'Account activated')
        onUpdate()
      } else {
        toast.error('Failed to update account')
      }
    } catch {
      toast.error('Failed to update account')
    }
  }

  const handleToggleWarmup = async () => {
    try {
      const response = await fetch(`/api/email-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warmup_enabled: !account.warmup_enabled }),
      })

      if (response.ok) {
        toast.success(account.warmup_enabled ? 'Warmup disabled' : 'Warmup enabled')
        onUpdate()
      } else {
        toast.error('Failed to update warmup')
      }
    } catch {
      toast.error('Failed to update warmup')
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/email-accounts/${account.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Account deleted')
        onUpdate()
      } else {
        toast.error('Failed to delete account')
      }
    } catch {
      toast.error('Failed to delete account')
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {account.display_name}
            </CardTitle>
            <CardDescription>{account.email}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleTest} disabled={testing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
                Test Connection
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={providerColors[account.provider] || providerColors.smtp}>
              {providerLabels[account.provider] || account.provider}
            </Badge>
            <Badge variant={account.health_score >= 80 ? 'default' : account.health_score >= 50 ? 'secondary' : 'destructive'}>
              {account.health_score >= 80 ? (
                <Check className="mr-1 h-3 w-3" />
              ) : (
                <X className="mr-1 h-3 w-3" />
              )}
              {account.health_score}%
            </Badge>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Daily Limit</span>
              <span>{account.daily_limit} emails</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active</span>
              <Switch
                checked={account.is_active}
                onCheckedChange={handleToggleActive}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Warmup</span>
              <Switch
                checked={account.warmup_enabled}
                onCheckedChange={handleToggleWarmup}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {account.email}? This action cannot be undone.
              All campaigns using this account will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
