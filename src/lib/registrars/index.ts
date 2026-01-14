// Re-export all registrar clients and types
export * from './types'
export * from './cloudflare'
export * from './namecheap'
export * from './porkbun'

import { createCloudflareClient } from './cloudflare'
import { createNamecheapClient } from './namecheap'
import { createPorkbunClient } from './porkbun'
import type { RegistrarClient, DomainSearchResult } from './types'

// Registrar types
export type RegistrarType = 'cloudflare' | 'namecheap' | 'porkbun'

// Configuration for all registrars
export interface RegistrarConfig {
  cloudflare?: {
    apiToken: string
    accountId: string
  }
  namecheap?: {
    apiUser: string
    apiKey: string
    username: string
    clientIp: string
    sandbox?: boolean
  }
  porkbun?: {
    apiKey: string
    secretApiKey: string
  }
}

// Factory to create registrar clients
export function createRegistrarClient(
  type: RegistrarType,
  config: RegistrarConfig
): RegistrarClient | null {
  switch (type) {
    case 'cloudflare':
      if (config.cloudflare) {
        return createCloudflareClient(
          config.cloudflare.apiToken,
          config.cloudflare.accountId
        )
      }
      break
    case 'namecheap':
      if (config.namecheap) {
        return createNamecheapClient(
          config.namecheap.apiUser,
          config.namecheap.apiKey,
          config.namecheap.username,
          config.namecheap.clientIp,
          config.namecheap.sandbox
        )
      }
      break
    case 'porkbun':
      if (config.porkbun) {
        return createPorkbunClient(
          config.porkbun.apiKey,
          config.porkbun.secretApiKey
        )
      }
      break
  }
  return null
}

// Search across multiple registrars
export async function searchDomainsAllRegistrars(
  query: string,
  config: RegistrarConfig,
  tlds: string[] = ['com', 'net', 'org', 'io', 'co']
): Promise<Record<RegistrarType, DomainSearchResult[]>> {
  const results: Record<RegistrarType, DomainSearchResult[]> = {
    cloudflare: [],
    namecheap: [],
    porkbun: [],
  }

  const registrars: RegistrarType[] = ['cloudflare', 'namecheap', 'porkbun']

  const searches = registrars.map(async (type) => {
    const client = createRegistrarClient(type, config)
    if (client) {
      try {
        const searchResults = await client.searchDomains(query, tlds)
        results[type] = searchResults
      } catch (error) {
        console.error(`${type} search failed:`, error)
      }
    }
  })

  await Promise.all(searches)

  return results
}

// Get best price across registrars
export function getBestPrice(
  domain: string,
  searchResults: Record<RegistrarType, DomainSearchResult[]>
): { registrar: RegistrarType; result: DomainSearchResult } | null {
  let bestPrice: number | null = null
  let bestResult: { registrar: RegistrarType; result: DomainSearchResult } | null = null

  for (const [registrar, results] of Object.entries(searchResults)) {
    const domainResult = results.find(r => r.domain === domain && r.available)
    if (domainResult && domainResult.price !== undefined) {
      if (bestPrice === null || domainResult.price < bestPrice) {
        bestPrice = domainResult.price
        bestResult = {
          registrar: registrar as RegistrarType,
          result: domainResult,
        }
      }
    }
  }

  return bestResult
}
