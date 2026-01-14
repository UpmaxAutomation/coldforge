import { promises as dns } from 'dns'

export interface DnsHealthResult {
  domain: string
  spf: {
    configured: boolean
    record: string | null
    valid: boolean
    issues: string[]
  }
  dkim: {
    configured: boolean
    selector: string | null
    record: string | null
    valid: boolean
    issues: string[]
  }
  dmarc: {
    configured: boolean
    record: string | null
    valid: boolean
    policy: string | null
    issues: string[]
  }
  mx: {
    configured: boolean
    records: string[]
    issues: string[]
  }
  overall: 'healthy' | 'warning' | 'error'
  checkedAt: string
}

// Check SPF record
async function checkSpf(domain: string): Promise<DnsHealthResult['spf']> {
  const result: DnsHealthResult['spf'] = {
    configured: false,
    record: null,
    valid: false,
    issues: [],
  }

  try {
    const records = await dns.resolveTxt(domain)
    const spfRecord = records.flat().find(r => r.startsWith('v=spf1'))

    if (spfRecord) {
      result.configured = true
      result.record = spfRecord

      // Basic SPF validation
      if (spfRecord.includes('~all') || spfRecord.includes('-all')) {
        result.valid = true
      } else if (spfRecord.includes('+all')) {
        result.issues.push('SPF has +all which allows anyone to send')
      } else if (spfRecord.includes('?all')) {
        result.issues.push('SPF has ?all which is neutral - consider using ~all or -all')
        result.valid = true
      } else {
        result.issues.push('SPF record may be missing all mechanism')
      }

      // Check for common issues
      if (spfRecord.length > 255) {
        result.issues.push('SPF record exceeds 255 characters - may need flattening')
      }

      const lookups = (spfRecord.match(/include:|a:|mx:|ptr:|exists:/g) || []).length
      if (lookups > 10) {
        result.issues.push(`SPF has ${lookups} lookups - exceeds 10 lookup limit`)
        result.valid = false
      }
    } else {
      result.issues.push('No SPF record found')
    }
  } catch (error) {
    result.issues.push('Failed to query SPF records')
  }

  return result
}

// Check DKIM record
async function checkDkim(domain: string, selector: string = 'default'): Promise<DnsHealthResult['dkim']> {
  const result: DnsHealthResult['dkim'] = {
    configured: false,
    selector,
    record: null,
    valid: false,
    issues: [],
  }

  const selectors = [selector, 'google', 'selector1', 'selector2', 'k1', 's1', 'dkim']

  for (const sel of selectors) {
    try {
      const dkimDomain = `${sel}._domainkey.${domain}`
      const records = await dns.resolveTxt(dkimDomain)
      const dkimRecord = records.flat().join('')

      if (dkimRecord && dkimRecord.includes('v=DKIM1')) {
        result.configured = true
        result.selector = sel
        result.record = dkimRecord

        // Basic DKIM validation
        if (dkimRecord.includes('p=')) {
          result.valid = true
        } else {
          result.issues.push('DKIM record missing public key')
        }
        break
      }
    } catch {
      // Try next selector
    }
  }

  if (!result.configured) {
    result.issues.push('No DKIM record found (checked common selectors)')
  }

  return result
}

// Check DMARC record
async function checkDmarc(domain: string): Promise<DnsHealthResult['dmarc']> {
  const result: DnsHealthResult['dmarc'] = {
    configured: false,
    record: null,
    valid: false,
    policy: null,
    issues: [],
  }

  try {
    const dmarcDomain = `_dmarc.${domain}`
    const records = await dns.resolveTxt(dmarcDomain)
    const dmarcRecord = records.flat().join('')

    if (dmarcRecord && dmarcRecord.startsWith('v=DMARC1')) {
      result.configured = true
      result.record = dmarcRecord

      // Extract policy
      const policyMatch = dmarcRecord.match(/p=(\w+)/)
      const extractedPolicy = policyMatch?.[1] ?? null
      if (extractedPolicy) {
        result.policy = extractedPolicy

        if (['none', 'quarantine', 'reject'].includes(extractedPolicy)) {
          result.valid = true

          if (result.policy === 'none') {
            result.issues.push('DMARC policy is "none" - emails are not protected')
          }
        } else {
          result.issues.push(`Invalid DMARC policy: ${result.policy}`)
        }
      } else {
        result.issues.push('DMARC record missing policy')
      }

      // Check for rua (aggregate reports)
      if (!dmarcRecord.includes('rua=')) {
        result.issues.push('Consider adding rua= for aggregate reports')
      }
    } else {
      result.issues.push('No DMARC record found')
    }
  } catch {
    result.issues.push('Failed to query DMARC record')
  }

  return result
}

// Check MX records
async function checkMx(domain: string): Promise<DnsHealthResult['mx']> {
  const result: DnsHealthResult['mx'] = {
    configured: false,
    records: [],
    issues: [],
  }

  try {
    const mxRecords = await dns.resolveMx(domain)

    if (mxRecords && mxRecords.length > 0) {
      result.configured = true
      result.records = mxRecords
        .sort((a, b) => a.priority - b.priority)
        .map(mx => `${mx.priority} ${mx.exchange}`)
    } else {
      result.issues.push('No MX records found')
    }
  } catch {
    result.issues.push('Failed to query MX records')
  }

  return result
}

// Full DNS health check
export async function checkDnsHealth(
  domain: string,
  dkimSelector?: string
): Promise<DnsHealthResult> {
  const [spf, dkim, dmarc, mx] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain, dkimSelector),
    checkDmarc(domain),
    checkMx(domain),
  ])

  // Determine overall health
  let overall: 'healthy' | 'warning' | 'error' = 'healthy'

  if (!spf.configured || !dmarc.configured) {
    overall = 'error'
  } else if (!dkim.configured || spf.issues.length > 0 || dmarc.issues.length > 0) {
    overall = 'warning'
  }

  return {
    domain,
    spf,
    dkim,
    dmarc,
    mx,
    overall,
    checkedAt: new Date().toISOString(),
  }
}

// Generate SPF record
export function generateSpfRecord(
  includes: string[] = [],
  mechanisms: string[] = [],
  qualifier: '~' | '-' | '+' | '?' = '~'
): string {
  const parts = ['v=spf1']

  // Add mechanisms (ip4, ip6, a, mx, etc.)
  parts.push(...mechanisms)

  // Add includes
  for (const include of includes) {
    parts.push(`include:${include}`)
  }

  // Add qualifier
  parts.push(`${qualifier}all`)

  return parts.join(' ')
}

// Generate DMARC record
export function generateDmarcRecord(options: {
  policy: 'none' | 'quarantine' | 'reject'
  subdomain_policy?: 'none' | 'quarantine' | 'reject'
  percentage?: number
  rua?: string // Aggregate report email
  ruf?: string // Forensic report email
  aspf?: 'r' | 's' // SPF alignment (relaxed/strict)
  adkim?: 'r' | 's' // DKIM alignment (relaxed/strict)
}): string {
  const parts = ['v=DMARC1', `p=${options.policy}`]

  if (options.subdomain_policy) {
    parts.push(`sp=${options.subdomain_policy}`)
  }

  if (options.percentage !== undefined && options.percentage !== 100) {
    parts.push(`pct=${options.percentage}`)
  }

  if (options.rua) {
    parts.push(`rua=mailto:${options.rua}`)
  }

  if (options.ruf) {
    parts.push(`ruf=mailto:${options.ruf}`)
  }

  if (options.aspf) {
    parts.push(`aspf=${options.aspf}`)
  }

  if (options.adkim) {
    parts.push(`adkim=${options.adkim}`)
  }

  return parts.join('; ')
}
