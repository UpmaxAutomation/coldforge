'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { DomainCard } from '@/components/domains/domain-card'
import { AddDomainModal } from '@/components/domains/add-domain-modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, AlertCircle, Globe } from 'lucide-react'

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

export default function DomainsContent() {
  const searchParams = useSearchParams()
  const [domains, setDomains] = useState<Domain[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    const response = await fetch(`/api/domains/${id}`, {
      method: 'POST',
    })

    if (response.ok) {
      await fetchDomains()
    }
  }

  const handleDeleteDomain = async (id: string) => {
    const response = await fetch(`/api/domains/${id}`, {
      method: 'DELETE',
    })

    if (response.ok) {
      setDomains(prev => prev.filter(d => d.id !== id))
    }
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
        <AddDomainModal onAdd={handleAddDomain} />
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
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Total Domains</div>
            <div className="text-2xl font-bold">{domains.length}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Healthy</div>
            <div className="text-2xl font-bold text-green-600">
              {domains.filter(d => d.health_status === 'healthy').length}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Warnings</div>
            <div className="text-2xl font-bold text-yellow-600">
              {domains.filter(d => d.health_status === 'warning').length}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium text-muted-foreground">Errors</div>
            <div className="text-2xl font-bold text-red-600">
              {domains.filter(d => d.health_status === 'error').length}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
