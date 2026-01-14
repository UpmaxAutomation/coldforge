'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { DomainCard } from '@/components/domains/domain-card'
import { AddDomainModal } from '@/components/domains/add-domain-modal'
import { DnsSetupGuide } from '@/components/domains/dns-setup-guide'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle, AlertCircle, Globe, Shield, TrendingUp, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

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
  health_score?: number
  last_health_check: string | null
  auto_purchased: boolean
  expires_at: string | null
}

export default function DomainsContent() {
  const searchParams = useSearchParams()
  const [domains, setDomains] = useState<Domain[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isVerifyingAll, setIsVerifyingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDomainForSetup, setSelectedDomainForSetup] = useState<Domain | null>(null)

  const success = searchParams.get('success')
  const errorParam = searchParams.get('error')

  const fetchDomains = useCallback(async () => {
    try {
      const response = await fetch('/api/domains')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch domains')
      }

      setDomains(data.domains || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch domains')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  const handleAddDomain = async (domain: string, dnsProvider: string | null) => {
    const response = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, dns_provider: dnsProvider }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to add domain')
    }

    setDomains(prev => [data.domain, ...prev])
  }

  const handleRefreshDomain = async (id: string) => {
    const response = await fetch(`/api/domains/${id}/verify`, {
      method: 'POST',
    })

    if (response.ok) {
      const data = await response.json()
      // Update domain in state with new verification data
      setDomains(prev => prev.map(d =>
        d.id === id
          ? {
              ...d,
              health_status: data.healthStatus,
              health_score: data.healthScore,
              spf_configured: data.records.spf.configured,
              dkim_configured: data.records.dkim.configured,
              dmarc_configured: data.records.dmarc.configured,
              last_health_check: data.checkedAt
            }
          : d
      ))
      toast.success('DNS verification complete')
    } else {
      toast.error('Failed to verify DNS')
    }
  }

  const handleVerifyAllDomains = async () => {
    setIsVerifyingAll(true)
    try {
      await Promise.all(domains.map(d => handleRefreshDomain(d.id)))
      toast.success('All domains verified')
    } catch {
      toast.error('Failed to verify some domains')
    } finally {
      setIsVerifyingAll(false)
    }
  }

  const handleDeleteDomain = async (id: string) => {
    const response = await fetch(`/api/domains/${id}`, {
      method: 'DELETE',
    })

    if (response.ok) {
      setDomains(prev => prev.filter(d => d.id !== id))
      toast.success('Domain removed')
    } else {
      toast.error('Failed to remove domain')
    }
  }

  // Calculate aggregate stats
  const getAverageHealthScore = () => {
    const domainsWithScore = domains.filter(d => d.health_score !== undefined)
    if (domainsWithScore.length === 0) return 0
    return Math.round(domainsWithScore.reduce((sum, d) => sum + (d.health_score || 0), 0) / domainsWithScore.length)
  }

  const getFullyConfiguredCount = () => {
    return domains.filter(d =>
      d.spf_configured && d.dkim_configured && d.dmarc_configured
    ).length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domains</h1>
          <p className="text-muted-foreground">
            Manage domains for your email campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {domains.length > 0 && (
            <Button
              variant="outline"
              onClick={handleVerifyAllDomains}
              disabled={isVerifyingAll}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isVerifyingAll ? 'animate-spin' : ''}`} />
              Verify All
            </Button>
          )}
          <AddDomainModal onAdd={handleAddDomain} />
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            {success === 'domain_added' && 'Domain added successfully!'}
          </AlertDescription>
        </Alert>
      )}

      {errorParam && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorParam === 'domain_exists' && 'This domain already exists.'}
            {errorParam === 'invalid_domain' && 'Invalid domain format.'}
            {!['domain_exists', 'invalid_domain'].includes(errorParam) && `Error: ${errorParam}`}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-lg border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Globe className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No domains yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first domain to start sending emails
          </p>
          <AddDomainModal onAdd={handleAddDomain} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              onRefresh={handleRefreshDomain}
              onDelete={handleDeleteDomain}
            />
          ))}
        </div>
      )}

      {/* Statistics */}
      {domains.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{domains.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Health Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{getAverageHealthScore()}%</div>
              <Progress value={getAverageHealthScore()} className="mt-2 h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fully Configured</CardTitle>
              <Shield className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {getFullyConfiguredCount()}/{domains.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {domains.filter(d => d.health_status === 'warning').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {domains.filter(d => d.health_status === 'error').length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DNS Setup Guide Modal */}
      {selectedDomainForSetup && (
        <DnsSetupGuide
          open={!!selectedDomainForSetup}
          onClose={() => setSelectedDomainForSetup(null)}
          domain={selectedDomainForSetup}
          onVerify={() => handleRefreshDomain(selectedDomainForSetup.id)}
        />
      )}
    </div>
  )
}
