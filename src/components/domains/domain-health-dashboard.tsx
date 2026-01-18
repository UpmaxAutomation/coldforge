'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Globe,
  Calendar,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DomainHealth {
  domainId: string
  domain: string
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  score: number
  spf: 'healthy' | 'warning' | 'critical' | 'unknown'
  dkim: 'healthy' | 'warning' | 'critical' | 'unknown'
  dmarc: 'healthy' | 'warning' | 'critical' | 'unknown'
  blacklist: 'healthy' | 'warning' | 'critical' | 'unknown'
  ageInDays: number
  isWarmupReady: boolean
  lastCheckAt?: Date
}

interface DomainHealthDashboardProps {
  workspaceId: string
}

export function DomainHealthDashboard({ workspaceId }: DomainHealthDashboardProps) {
  const [domains, setDomains] = useState<DomainHealth[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDomainHealth = async () => {
    try {
      const response = await fetch(`/api/domains/health?workspaceId=${workspaceId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch domain health')
      }

      setDomains(data.domains || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDomainHealth()
  }, [workspaceId])

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await fetch('/api/domains/health/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      await fetchDomainHealth()
    } finally {
      setIsRefreshing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      critical: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      unknown: 'bg-muted text-muted-foreground',
    }

    return (
      <Badge variant="outline" className={colors[status as keyof typeof colors] || colors.unknown}>
        {status}
      </Badge>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  // Summary stats
  const stats = {
    total: domains.length,
    healthy: domains.filter(d => d.status === 'healthy').length,
    warning: domains.filter(d => d.status === 'warning').length,
    critical: domains.filter(d => d.status === 'critical').length,
    warmupReady: domains.filter(d => d.isWarmupReady).length,
    avgScore: domains.length > 0
      ? Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length)
      : 0,
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading domain health...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.healthy}</p>
                <p className="text-xs text-muted-foreground">Healthy Domains</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.warning}</p>
                <p className="text-xs text-muted-foreground">Need Attention</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.critical}</p>
                <p className="text-xs text-muted-foreground">Critical Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgScore}%</p>
                <p className="text-xs text-muted-foreground">Avg Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain Health Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Domain Health Monitor
            </CardTitle>
            <CardDescription>
              Real-time monitoring of DNS records and blacklist status
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh All
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center text-destructive">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>{error}</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No domains found</p>
              <p className="text-sm">Purchase domains to start monitoring</p>
            </div>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-center">SPF</TableHead>
                    <TableHead className="text-center">DKIM</TableHead>
                    <TableHead className="text-center">DMARC</TableHead>
                    <TableHead className="text-center">Blacklist</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Warmup</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow key={domain.domainId}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {domain.domain}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(domain.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn('font-bold', getScoreColor(domain.score))}>
                            {domain.score}%
                          </span>
                          <Progress value={domain.score} className="w-16 h-2" />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>{getStatusIcon(domain.spf)}</TooltipTrigger>
                          <TooltipContent>SPF: {domain.spf}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>{getStatusIcon(domain.dkim)}</TooltipTrigger>
                          <TooltipContent>DKIM: {domain.dkim}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>{getStatusIcon(domain.dmarc)}</TooltipTrigger>
                          <TooltipContent>DMARC: {domain.dmarc}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-center">
                        <Tooltip>
                          <TooltipTrigger>{getStatusIcon(domain.blacklist)}</TooltipTrigger>
                          <TooltipContent>Blacklist: {domain.blacklist}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {domain.ageInDays}d
                        </div>
                      </TableCell>
                      <TableCell>
                        {domain.isWarmupReady ? (
                          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20">
                                <Timer className="h-3 w-3 mr-1" />
                                {14 - domain.ageInDays}d left
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Domain needs to be 14 days old for warmup
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
