'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Globe, CheckCircle, XCircle, AlertTriangle, RefreshCw, Trash2, ExternalLink } from 'lucide-react'

interface Domain {
  id: string
  domain: string
  registrar: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
  dns_provider: string | null
  spf_configured: boolean
  dkim_configured: boolean
  dmarc_configured: boolean
  bimi_configured: boolean
  health_status: 'healthy' | 'warning' | 'error' | 'pending'
  last_health_check: string | null
  auto_purchased: boolean
  expires_at: string | null
}

interface DomainCardProps {
  domain: Domain
  onRefresh: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function DomainCard({ domain, onRefresh, onDelete }: DomainCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh(domain.id)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(domain.id)
    } finally {
      setIsDeleting(false)
    }
  }

  const getStatusIcon = () => {
    switch (domain.health_status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Globe className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusColor = () => {
    switch (domain.health_status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const DnsIndicator = ({ configured, label }: { configured: boolean; label: string }) => (
    <div className="flex items-center gap-1.5">
      {configured ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-500" />
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{domain.domain}</h3>
                <a
                  href={`https://${domain.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getStatusColor()}>
                  {domain.health_status}
                </Badge>
                {domain.registrar && (
                  <Badge variant="outline">
                    {domain.registrar === 'manual' ? 'Manual' : domain.registrar}
                  </Badge>
                )}
                {domain.auto_purchased && (
                  <Badge variant="secondary">Auto-purchased</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isDeleting}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Domain</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove {domain.domain}? This will not delete the domain from your registrar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center gap-4">
            <DnsIndicator configured={domain.spf_configured} label="SPF" />
            <DnsIndicator configured={domain.dkim_configured} label="DKIM" />
            <DnsIndicator configured={domain.dmarc_configured} label="DMARC" />
            <DnsIndicator configured={domain.bimi_configured} label="BIMI" />
          </div>
          {domain.last_health_check && (
            <p className="text-xs text-muted-foreground mt-2">
              Last checked: {new Date(domain.last_health_check).toLocaleString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
