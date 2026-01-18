'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Search,
  Globe,
  Check,
  X,
  ShoppingCart,
  Loader2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DomainAvailability {
  domain: string
  available: boolean
  premium: boolean
  price?: number
  tld: string
}

interface DomainSearchProps {
  workspaceId: string
  onPurchaseComplete?: () => void
}

export function DomainSearch({ workspaceId, onPurchaseComplete }: DomainSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [results, setResults] = useState<DomainAvailability[]>([])
  const [suggestions, setSuggestions] = useState<DomainAvailability[]>([])
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const selectedTLDs = ['com', 'net', 'org', 'io', 'co']

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    setResults([])
    setSuggestions([])
    setSelectedDomains(new Set())

    try {
      const response = await fetch('/api/domains/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseName: searchQuery.toLowerCase().replace(/[^a-z0-9-]/g, ''),
          tlds: selectedTLDs,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      setResults(data.domains || [])
      setSuggestions(data.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const toggleDomainSelection = (domain: string) => {
    const newSelected = new Set(selectedDomains)
    if (newSelected.has(domain)) {
      newSelected.delete(domain)
    } else {
      newSelected.add(domain)
    }
    setSelectedDomains(newSelected)
  }

  const selectAllAvailable = () => {
    const available = results.filter(d => d.available && !d.premium)
    setSelectedDomains(new Set(available.map(d => d.domain)))
  }

  const clearSelection = () => {
    setSelectedDomains(new Set())
  }

  const handlePurchase = async () => {
    if (selectedDomains.size === 0) return

    setIsPurchasing(true)
    setError(null)

    try {
      const response = await fetch('/api/domains/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          domains: Array.from(selectedDomains),
          autoRenew: true,
          privacy: true,
          setupDNS: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Purchase failed')
      }

      // Remove purchased domains from results
      setResults(prev => prev.filter(d => !selectedDomains.has(d.domain)))
      setSelectedDomains(new Set())

      if (onPurchaseComplete) {
        onPurchaseComplete()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed')
    } finally {
      setIsPurchasing(false)
    }
  }

  const totalSelectedPrice = results
    .filter(d => selectedDomains.has(d.domain))
    .reduce((sum, d) => sum + (d.price || 10), 0)

  const DomainResult = ({ domain, showCheckbox = true }: { domain: DomainAvailability; showCheckbox?: boolean }) => (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border transition-colors',
        domain.available
          ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
          : 'bg-muted/50 border-muted',
        selectedDomains.has(domain.domain) && 'ring-2 ring-primary'
      )}
    >
      <div className="flex items-center gap-3">
        {showCheckbox && domain.available && !domain.premium && (
          <Checkbox
            checked={selectedDomains.has(domain.domain)}
            onCheckedChange={() => toggleDomainSelection(domain.domain)}
          />
        )}
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{domain.domain}</span>
        </div>
        <div className="flex items-center gap-1">
          {domain.available ? (
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/20">
              <Check className="h-3 w-3 mr-1" />
              Available
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/20">
              <X className="h-3 w-3 mr-1" />
              Taken
            </Badge>
          )}
          {domain.premium && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/20">
              <Sparkles className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          )}
        </div>
      </div>
      {domain.available && (
        <div className="text-right">
          <span className="font-semibold">${domain.price?.toFixed(2) || '10.00'}</span>
          <span className="text-xs text-muted-foreground">/yr</span>
        </div>
      )}
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Domain Search
        </CardTitle>
        <CardDescription>
          Search for available domains and purchase them instantly with auto DNS setup
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Enter domain name (e.g., mycompany)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pr-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {/* Selection Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAllAvailable}>
                  Select All Available
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedDomains.size} selected
              </div>
            </div>

            {/* Domain List */}
            <div className="space-y-2">
              {results.map((domain) => (
                <DomainResult key={domain.domain} domain={domain} />
              ))}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="pt-4 border-t">
                <Label className="text-sm text-muted-foreground mb-2 block">Suggestions</Label>
                <div className="space-y-2">
                  {suggestions.map((domain) => (
                    <DomainResult key={domain.domain} domain={domain} />
                  ))}
                </div>
              </div>
            )}

            {/* Purchase Section */}
            {selectedDomains.size > 0 && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {selectedDomains.size} domain{selectedDomains.size > 1 ? 's' : ''} selected
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Includes auto DNS setup (SPF, DKIM, DMARC)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${totalSelectedPrice.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">per year</p>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  size="lg"
                  onClick={handlePurchase}
                  disabled={isPurchasing}
                >
                  {isPurchasing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Purchasing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Purchase {selectedDomains.size} Domain{selectedDomains.size > 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!isSearching && results.length === 0 && searchQuery && (
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No results yet. Click search to check availability.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
