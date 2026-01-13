export * from './database'

// App-level types
export interface User {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  organizationId: string | null
  role: 'owner' | 'admin' | 'member'
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'pro' | 'agency'
}

// Navigation
export interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

// Stats
export interface CampaignStats {
  sent: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

export interface DomainHealth {
  spf: boolean
  dkim: boolean
  dmarc: boolean
  bimi: boolean
  overall: 'healthy' | 'warning' | 'error' | 'pending'
}
