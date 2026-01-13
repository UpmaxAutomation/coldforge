// DNS Automation - Auto-generate and configure DNS records
import * as dns from 'dns'
import { promisify } from 'util'
import * as crypto from 'crypto'

const resolveTxt = promisify(dns.resolveTxt)
const resolveMx = promisify(dns.resolveMx)

// =====================================================
// Types
// =====================================================

export interface DnsRecordConfig {
  type: 'TXT' | 'MX' | 'CNAME' | 'A' | 'AAAA'
  name: string
  value: string
  ttl: number
  priority?: number
}

export interface SpfConfig {
  includes: string[]
  ip4?: string[]
  ip6?: string[]
  all: '-all' | '~all' | '?all' | '+all'
}

export interface DkimConfig {
  selector: string
  domain: string
  keySize: 1024 | 2048
  privateKey?: string
  publicKey?: string
}

export interface DmarcConfig {
  policy: 'none' | 'quarantine' | 'reject'
  subdomainPolicy?: 'none' | 'quarantine' | 'reject'
  percentage?: number
  rua?: string[] // Aggregate reports
  ruf?: string[] // Forensic reports
  adkim?: 'r' | 's' // DKIM alignment mode
  aspf?: 'r' | 's' // SPF alignment mode
}

export interface BimiConfig {
  svgUrl: string
  vmcUrl?: string // Verified Mark Certificate
}

export interface DnsSetupResult {
  spf: DnsRecordConfig
  dkim: DnsRecordConfig
  dmarc: DnsRecordConfig
  bimi?: DnsRecordConfig
  mx?: DnsRecordConfig[]
}

export interface DnsValidationResult {
  record: string
  expected: string
  actual: string | null
  valid: boolean
  issues: string[]
}

// =====================================================
// SPF Record Generation
// =====================================================

export function generateSpf(config: SpfConfig): string {
  const parts = ['v=spf1']

  // Add include directives
  config.includes.forEach(include => {
    parts.push(`include:${include}`)
  })

  // Add IPv4 addresses
  if (config.ip4) {
    config.ip4.forEach(ip => {
      parts.push(`ip4:${ip}`)
    })
  }

  // Add IPv6 addresses
  if (config.ip6) {
    config.ip6.forEach(ip => {
      parts.push(`ip6:${ip}`)
    })
  }

  // Add all directive
  parts.push(config.all)

  return parts.join(' ')
}

export function getDefaultSpfConfig(provider: 'google' | 'microsoft' | 'custom'): SpfConfig {
  switch (provider) {
    case 'google':
      return {
        includes: ['_spf.google.com'],
        all: '~all'
      }
    case 'microsoft':
      return {
        includes: ['spf.protection.outlook.com'],
        all: '~all'
      }
    case 'custom':
    default:
      return {
        includes: [],
        all: '~all'
      }
  }
}

// =====================================================
// DKIM Key Generation
// =====================================================

export interface DkimKeyPair {
  privateKey: string
  publicKey: string
  dnsRecord: string
  selector: string
}

export function generateDkimKeyPair(selector: string, keySize: 1024 | 2048 = 2048): DkimKeyPair {
  // Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })

  // Extract public key for DNS record (remove headers and newlines)
  const publicKeyBase64 = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '')
    .trim()

  // Generate DNS record value
  const dnsRecord = `v=DKIM1; k=rsa; p=${publicKeyBase64}`

  return {
    privateKey,
    publicKey,
    dnsRecord,
    selector
  }
}

export function generateDkimRecord(config: DkimConfig): DnsRecordConfig {
  let publicKeyBase64 = ''

  if (config.publicKey) {
    publicKeyBase64 = config.publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '')
      .trim()
  }

  return {
    type: 'TXT',
    name: `${config.selector}._domainkey`,
    value: `v=DKIM1; k=rsa; p=${publicKeyBase64}`,
    ttl: 3600
  }
}

// =====================================================
// DMARC Record Generation
// =====================================================

export function generateDmarc(config: DmarcConfig): string {
  const parts = ['v=DMARC1', `p=${config.policy}`]

  if (config.subdomainPolicy) {
    parts.push(`sp=${config.subdomainPolicy}`)
  }

  if (config.percentage !== undefined && config.percentage < 100) {
    parts.push(`pct=${config.percentage}`)
  }

  if (config.rua && config.rua.length > 0) {
    parts.push(`rua=${config.rua.map(r => `mailto:${r}`).join(',')}`)
  }

  if (config.ruf && config.ruf.length > 0) {
    parts.push(`ruf=${config.ruf.map(r => `mailto:${r}`).join(',')}`)
  }

  if (config.adkim) {
    parts.push(`adkim=${config.adkim}`)
  }

  if (config.aspf) {
    parts.push(`aspf=${config.aspf}`)
  }

  return parts.join('; ')
}

export function getDefaultDmarcConfig(reportEmail: string): DmarcConfig {
  return {
    policy: 'quarantine',
    subdomainPolicy: 'quarantine',
    percentage: 100,
    rua: [reportEmail],
    adkim: 'r',
    aspf: 'r'
  }
}

export function generateDmarcRecord(domain: string, config: DmarcConfig): DnsRecordConfig {
  return {
    type: 'TXT',
    name: `_dmarc.${domain}`,
    value: generateDmarc(config),
    ttl: 3600
  }
}

// =====================================================
// BIMI Record Generation
// =====================================================

export function generateBimi(config: BimiConfig): string {
  const parts = ['v=BIMI1', `l=${config.svgUrl}`]

  if (config.vmcUrl) {
    parts.push(`a=${config.vmcUrl}`)
  }

  return parts.join('; ')
}

export function generateBimiRecord(domain: string, config: BimiConfig): DnsRecordConfig {
  return {
    type: 'TXT',
    name: `default._bimi.${domain}`,
    value: generateBimi(config),
    ttl: 3600
  }
}

// =====================================================
// MX Record Generation
// =====================================================

export function getDefaultMxRecords(provider: 'google' | 'microsoft' | 'custom'): DnsRecordConfig[] {
  switch (provider) {
    case 'google':
      return [
        { type: 'MX', name: '@', value: 'aspmx.l.google.com', ttl: 3600, priority: 1 },
        { type: 'MX', name: '@', value: 'alt1.aspmx.l.google.com', ttl: 3600, priority: 5 },
        { type: 'MX', name: '@', value: 'alt2.aspmx.l.google.com', ttl: 3600, priority: 5 },
        { type: 'MX', name: '@', value: 'alt3.aspmx.l.google.com', ttl: 3600, priority: 10 },
        { type: 'MX', name: '@', value: 'alt4.aspmx.l.google.com', ttl: 3600, priority: 10 },
      ]
    case 'microsoft':
      return [
        { type: 'MX', name: '@', value: 'your-domain-com.mail.protection.outlook.com', ttl: 3600, priority: 0 },
      ]
    default:
      return []
  }
}

// =====================================================
// Complete DNS Setup Generation
// =====================================================

export interface DnsSetupOptions {
  domain: string
  provider: 'google' | 'microsoft' | 'custom'
  dkimSelector?: string
  dmarcReportEmail?: string
  bimiConfig?: BimiConfig
  customSpf?: SpfConfig
  customMx?: DnsRecordConfig[]
}

export async function generateDnsSetup(options: DnsSetupOptions): Promise<DnsSetupResult> {
  const {
    domain,
    provider,
    dkimSelector = 'mail',
    dmarcReportEmail = `dmarc@${domain}`,
    bimiConfig,
    customSpf,
    customMx
  } = options

  // Generate SPF
  const spfConfig = customSpf || getDefaultSpfConfig(provider)
  const spf: DnsRecordConfig = {
    type: 'TXT',
    name: '@',
    value: generateSpf(spfConfig),
    ttl: 3600
  }

  // Generate DKIM key pair
  const dkimKeyPair = generateDkimKeyPair(dkimSelector, 2048)
  const dkim: DnsRecordConfig = {
    type: 'TXT',
    name: `${dkimSelector}._domainkey`,
    value: dkimKeyPair.dnsRecord,
    ttl: 3600
  }

  // Generate DMARC
  const dmarcConfig = getDefaultDmarcConfig(dmarcReportEmail)
  const dmarc: DnsRecordConfig = {
    type: 'TXT',
    name: '_dmarc',
    value: generateDmarc(dmarcConfig),
    ttl: 3600
  }

  // Generate MX records
  const mx = customMx || getDefaultMxRecords(provider)

  // Generate BIMI if configured
  let bimi: DnsRecordConfig | undefined
  if (bimiConfig) {
    bimi = generateBimiRecord(domain, bimiConfig)
  }

  return {
    spf,
    dkim,
    dmarc,
    bimi,
    mx: mx.length > 0 ? mx : undefined
  }
}

// =====================================================
// DNS Validation
// =====================================================

export async function validateSpf(domain: string, expected: string): Promise<DnsValidationResult> {
  const issues: string[] = []
  let actual: string | null = null
  let valid = false

  try {
    const records = await resolveTxt(domain)
    const spfRecord = records.flat().find(r => r.startsWith('v=spf1'))
    actual = spfRecord || null

    if (!actual) {
      issues.push('No SPF record found')
    } else if (actual === expected) {
      valid = true
    } else {
      issues.push('SPF record does not match expected value')
    }
  } catch (error) {
    issues.push(`DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return {
    record: 'SPF',
    expected,
    actual,
    valid,
    issues
  }
}

export async function validateDkim(domain: string, selector: string, expected: string): Promise<DnsValidationResult> {
  const issues: string[] = []
  let actual: string | null = null
  let valid = false

  const dkimHost = `${selector}._domainkey.${domain}`

  try {
    const records = await resolveTxt(dkimHost)
    const dkimRecord = records.flat().join('')
    actual = dkimRecord || null

    if (!actual) {
      issues.push('No DKIM record found')
    } else if (actual.includes('v=DKIM1')) {
      // Basic validation - check key presence
      if (actual.includes('p=') && actual.includes('k=rsa')) {
        valid = true
      } else {
        issues.push('DKIM record missing required fields')
      }
    } else {
      issues.push('Invalid DKIM record format')
    }
  } catch (error) {
    issues.push(`DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return {
    record: 'DKIM',
    expected,
    actual,
    valid,
    issues
  }
}

export async function validateDmarc(domain: string, expected: string): Promise<DnsValidationResult> {
  const issues: string[] = []
  let actual: string | null = null
  let valid = false

  const dmarcHost = `_dmarc.${domain}`

  try {
    const records = await resolveTxt(dmarcHost)
    const dmarcRecord = records.flat().find(r => r.startsWith('v=DMARC1'))
    actual = dmarcRecord || null

    if (!actual) {
      issues.push('No DMARC record found')
    } else if (actual.includes('v=DMARC1') && actual.includes('p=')) {
      valid = true
    } else {
      issues.push('Invalid DMARC record format')
    }
  } catch (error) {
    issues.push(`DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return {
    record: 'DMARC',
    expected,
    actual,
    valid,
    issues
  }
}

export async function validateMx(domain: string): Promise<DnsValidationResult> {
  const issues: string[] = []
  let actual: string | null = null
  let valid = false

  try {
    const records = await resolveMx(domain)
    if (records && records.length > 0) {
      actual = records.map(r => `${r.priority} ${r.exchange}`).join(', ')
      valid = true
    } else {
      issues.push('No MX records found')
    }
  } catch (error) {
    issues.push(`DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return {
    record: 'MX',
    expected: 'Valid MX records',
    actual,
    valid,
    issues
  }
}

export async function validateAllDns(
  domain: string,
  dkimSelector: string = 'mail'
): Promise<{
  spf: DnsValidationResult
  dkim: DnsValidationResult
  dmarc: DnsValidationResult
  mx: DnsValidationResult
  overall: 'valid' | 'partial' | 'invalid'
}> {
  const [spf, dkim, dmarc, mx] = await Promise.all([
    validateSpf(domain, ''),
    validateDkim(domain, dkimSelector, ''),
    validateDmarc(domain, ''),
    validateMx(domain)
  ])

  const validCount = [spf, dkim, dmarc, mx].filter(r => r.valid).length
  let overall: 'valid' | 'partial' | 'invalid'

  if (validCount === 4) {
    overall = 'valid'
  } else if (validCount >= 2) {
    overall = 'partial'
  } else {
    overall = 'invalid'
  }

  return { spf, dkim, dmarc, mx, overall }
}

// =====================================================
// DNS Record Instructions (for manual setup)
// =====================================================

export function generateDnsInstructions(setup: DnsSetupResult): string {
  const instructions: string[] = [
    '# DNS Configuration Instructions',
    '',
    'Add the following DNS records to your domain:',
    '',
    '## SPF Record',
    `Type: TXT`,
    `Name: ${setup.spf.name}`,
    `Value: ${setup.spf.value}`,
    `TTL: ${setup.spf.ttl}`,
    '',
    '## DKIM Record',
    `Type: TXT`,
    `Name: ${setup.dkim.name}`,
    `Value: ${setup.dkim.value}`,
    `TTL: ${setup.dkim.ttl}`,
    '',
    '## DMARC Record',
    `Type: TXT`,
    `Name: ${setup.dmarc.name}`,
    `Value: ${setup.dmarc.value}`,
    `TTL: ${setup.dmarc.ttl}`,
  ]

  if (setup.bimi) {
    instructions.push(
      '',
      '## BIMI Record',
      `Type: TXT`,
      `Name: ${setup.bimi.name}`,
      `Value: ${setup.bimi.value}`,
      `TTL: ${setup.bimi.ttl}`,
    )
  }

  if (setup.mx && setup.mx.length > 0) {
    instructions.push(
      '',
      '## MX Records',
    )
    setup.mx.forEach((mx, i) => {
      instructions.push(
        `${i + 1}. Type: MX, Name: ${mx.name}, Value: ${mx.value}, Priority: ${mx.priority}, TTL: ${mx.ttl}`
      )
    })
  }

  return instructions.join('\n')
}
