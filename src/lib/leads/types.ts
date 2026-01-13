// Lead Management Types

export interface Lead {
  id: string
  organizationId: string
  email: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  linkedinUrl?: string
  website?: string
  customFields: Record<string, string>
  tags: string[]
  listIds: string[]
  status: LeadStatus
  source: LeadSource
  sourceDetails?: string
  lastContactedAt?: string
  createdAt: string
  updatedAt: string
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'not_interested'
  | 'bounced'
  | 'unsubscribed'

export type LeadSource =
  | 'csv_import'
  | 'api'
  | 'manual'
  | 'linkedin'
  | 'website'
  | 'integration'

export interface LeadList {
  id: string
  organizationId: string
  name: string
  description?: string
  leadCount: number
  color?: string
  createdAt: string
  updatedAt: string
}

export interface LeadTag {
  id: string
  organizationId: string
  name: string
  color: string
  leadCount: number
  createdAt: string
}

export interface LeadImportConfig {
  listId?: string
  tags?: string[]
  skipDuplicates: boolean
  updateExisting: boolean
  mapping: ColumnMapping
}

export interface ColumnMapping {
  email: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  linkedinUrl?: string
  website?: string
  customFields?: Record<string, string>
}

export interface ImportResult {
  success: boolean
  totalRows: number
  imported: number
  skipped: number
  updated: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  email?: string
  reason: string
}

export interface LeadFilter {
  search?: string
  status?: LeadStatus[]
  tags?: string[]
  listIds?: string[]
  source?: LeadSource[]
  dateRange?: {
    start: string
    end: string
  }
}

export interface LeadStats {
  total: number
  byStatus: Record<LeadStatus, number>
  bySource: Record<LeadSource, number>
  recentImports: number
  contactedLast7Days: number
  repliedLast7Days: number
}

// Default tag colors
export const DEFAULT_TAG_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
]

// CSV field suggestions
export const COMMON_CSV_HEADERS = [
  'email',
  'first_name',
  'last_name',
  'company',
  'title',
  'phone',
  'linkedin_url',
  'website',
  'industry',
  'location',
  'employee_count',
  'revenue',
]

export function getRandomTagColor(): string {
  return DEFAULT_TAG_COLORS[Math.floor(Math.random() * DEFAULT_TAG_COLORS.length)]
}
