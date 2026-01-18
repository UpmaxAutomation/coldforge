'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Timer,
  Flame,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DomainAge {
  domainId: string
  domain: string
  purchasedAt: Date
  ageInDays: number
  isWarmupReady: boolean
  warmupReadyDate: Date
  recommendedWarmupStart: Date
  recommendedFirstCampaign: Date
}

interface DomainAgeTrackerProps {
  workspaceId: string
}

const WARMUP_READY_DAYS = 14
const RECOMMENDED_WARMUP_DAYS = 21
const RECOMMENDED_CAMPAIGN_DAYS = 30

export function DomainAgeTracker({ workspaceId }: DomainAgeTrackerProps) {
  const [domains, setDomains] = useState<DomainAge[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const response = await fetch(`/api/domains/list?workspaceId=${workspaceId}&status=active`)
        const data = await response.json()

        if (data.domains) {
          const now = new Date()
          const transformed = data.domains.map((d: { id: string; domain: string; purchasedAt: string; ageInDays: number }) => {
            const purchasedAt = new Date(d.purchasedAt)
            const warmupReadyDate = new Date(purchasedAt)
            warmupReadyDate.setDate(warmupReadyDate.getDate() + WARMUP_READY_DAYS)

            const recommendedWarmupStart = new Date(purchasedAt)
            recommendedWarmupStart.setDate(recommendedWarmupStart.getDate() + RECOMMENDED_WARMUP_DAYS)

            const recommendedFirstCampaign = new Date(purchasedAt)
            recommendedFirstCampaign.setDate(recommendedFirstCampaign.getDate() + RECOMMENDED_CAMPAIGN_DAYS)

            return {
              domainId: d.id,
              domain: d.domain,
              purchasedAt,
              ageInDays: d.ageInDays,
              isWarmupReady: d.ageInDays >= WARMUP_READY_DAYS,
              warmupReadyDate,
              recommendedWarmupStart,
              recommendedFirstCampaign,
            }
          })
          setDomains(transformed)
        }
      } catch (error) {
        console.error('Failed to fetch domains:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDomains()
  }, [workspaceId])

  const getPhaseInfo = (ageInDays: number) => {
    if (ageInDays < WARMUP_READY_DAYS) {
      return {
        phase: 'Aging',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
        icon: Clock,
        description: 'Domain is aging before warmup can begin',
      }
    }
    if (ageInDays < RECOMMENDED_WARMUP_DAYS) {
      return {
        phase: 'Warmup Ready',
        color: 'text-blue-500',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        icon: Flame,
        description: 'Domain can start warmup process',
      }
    }
    if (ageInDays < RECOMMENDED_CAMPAIGN_DAYS) {
      return {
        phase: 'Warming',
        color: 'text-orange-500',
        bgColor: 'bg-orange-100 dark:bg-orange-900/20',
        icon: Flame,
        description: 'Domain should be warming up',
      }
    }
    return {
      phase: 'Campaign Ready',
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      icon: CheckCircle,
      description: 'Domain is ready for email campaigns',
    }
  }

  const getProgressValue = (ageInDays: number) => {
    return Math.min((ageInDays / RECOMMENDED_CAMPAIGN_DAYS) * 100, 100)
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const getDaysRemaining = (targetDate: Date) => {
    const now = new Date()
    const diff = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  // Summary stats
  const stats = {
    total: domains.length,
    aging: domains.filter(d => d.ageInDays < WARMUP_READY_DAYS).length,
    warmupReady: domains.filter(d => d.ageInDays >= WARMUP_READY_DAYS && d.ageInDays < RECOMMENDED_CAMPAIGN_DAYS).length,
    campaignReady: domains.filter(d => d.ageInDays >= RECOMMENDED_CAMPAIGN_DAYS).length,
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading domain age data...
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Domain Age Tracker
          </CardTitle>
          <CardDescription>
            Monitor domain age and readiness for email campaigns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.aging}</p>
              <p className="text-xs text-muted-foreground">Aging</p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/20 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.warmupReady}</p>
              <p className="text-xs text-muted-foreground">Warming</p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.campaignReady}</p>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
          </div>

          {/* Domain List */}
          {domains.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No domains to track</p>
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((domain) => {
                const phaseInfo = getPhaseInfo(domain.ageInDays)
                const PhaseIcon = phaseInfo.icon

                return (
                  <div
                    key={domain.domainId}
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', phaseInfo.bgColor)}>
                          <PhaseIcon className={cn('h-4 w-4', phaseInfo.color)} />
                        </div>
                        <div>
                          <p className="font-medium">{domain.domain}</p>
                          <p className="text-xs text-muted-foreground">
                            Purchased {formatDate(domain.purchasedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={phaseInfo.bgColor}>
                        {phaseInfo.phase}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Age Progress</span>
                        <span className="font-medium">{domain.ageInDays} / {RECOMMENDED_CAMPAIGN_DAYS} days</span>
                      </div>
                      <Progress value={getProgressValue(domain.ageInDays)} className="h-2" />
                    </div>

                    {/* Milestones */}
                    <div className="mt-4 flex items-center gap-4 text-xs">
                      <Tooltip>
                        <TooltipTrigger>
                          <div className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded',
                            domain.isWarmupReady
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {domain.isWarmupReady ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <Timer className="h-3 w-3" />
                            )}
                            Warmup {domain.isWarmupReady ? '✓' : `in ${getDaysRemaining(domain.warmupReadyDate)}d`}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {domain.isWarmupReady
                            ? 'Domain can begin warmup'
                            : `Ready for warmup on ${formatDate(domain.warmupReadyDate)}`
                          }
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger>
                          <div className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded',
                            domain.ageInDays >= RECOMMENDED_CAMPAIGN_DAYS
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {domain.ageInDays >= RECOMMENDED_CAMPAIGN_DAYS ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <Timer className="h-3 w-3" />
                            )}
                            Campaign {domain.ageInDays >= RECOMMENDED_CAMPAIGN_DAYS ? '✓' : `in ${getDaysRemaining(domain.recommendedFirstCampaign)}d`}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {domain.ageInDays >= RECOMMENDED_CAMPAIGN_DAYS
                            ? 'Domain ready for email campaigns'
                            : `Recommended campaign start: ${formatDate(domain.recommendedFirstCampaign)}`
                          }
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Domain Lifecycle</p>
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-400" />
                <span>0-14d: Aging</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-400" />
                <span>14-30d: Warmup</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-400" />
                <span>30d+: Campaign Ready</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
