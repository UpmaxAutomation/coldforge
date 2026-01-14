export interface DnsRecord {
  type: 'TXT' | 'MX' | 'CNAME' | 'A'
  name: string
  content: string
  ttl: number
}

export function generateSpfRecord(domain: string): DnsRecord {
  return {
    type: 'TXT',
    name: domain,
    content: 'v=spf1 include:_spf.google.com include:sendgrid.net ~all',
    ttl: 3600
  }
}

export function generateDkimRecord(domain: string, selector: string, publicKey: string): DnsRecord {
  return {
    type: 'TXT',
    name: `${selector}._domainkey.${domain}`,
    content: `v=DKIM1; k=rsa; p=${publicKey}`,
    ttl: 3600
  }
}

export function generateDmarcRecord(domain: string, email: string): DnsRecord {
  return {
    type: 'TXT',
    name: `_dmarc.${domain}`,
    content: `v=DMARC1; p=quarantine; rua=mailto:${email}; pct=100`,
    ttl: 3600
  }
}

export function generateAllRecords(domain: string, email: string): DnsRecord[] {
  return [
    generateSpfRecord(domain),
    generateDmarcRecord(domain, email)
  ]
}
