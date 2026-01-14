import { describe, it, expect } from 'vitest'
import { generateSpfRecord, generateDmarcRecord } from '@/lib/dns'

describe('dns', () => {
  describe('generateSpfRecord', () => {
    it('should generate basic SPF record with soft fail', () => {
      const record = generateSpfRecord()
      expect(record).toBe('v=spf1 ~all')
    })

    it('should include single mechanism', () => {
      const record = generateSpfRecord([], ['ip4:192.168.1.1'])
      expect(record).toBe('v=spf1 ip4:192.168.1.1 ~all')
    })

    it('should include multiple mechanisms', () => {
      const record = generateSpfRecord([], ['ip4:192.168.1.1', 'mx', 'a'])
      expect(record).toBe('v=spf1 ip4:192.168.1.1 mx a ~all')
    })

    it('should include single include', () => {
      const record = generateSpfRecord(['_spf.google.com'])
      expect(record).toBe('v=spf1 include:_spf.google.com ~all')
    })

    it('should include multiple includes', () => {
      const record = generateSpfRecord(['_spf.google.com', 'spf.protection.outlook.com'])
      expect(record).toBe('v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all')
    })

    it('should combine mechanisms and includes', () => {
      const record = generateSpfRecord(['_spf.google.com'], ['mx'])
      expect(record).toBe('v=spf1 mx include:_spf.google.com ~all')
    })

    it('should use hard fail qualifier', () => {
      const record = generateSpfRecord([], [], '-')
      expect(record).toBe('v=spf1 -all')
    })

    it('should use pass qualifier', () => {
      const record = generateSpfRecord([], [], '+')
      expect(record).toBe('v=spf1 +all')
    })

    it('should use neutral qualifier', () => {
      const record = generateSpfRecord([], [], '?')
      expect(record).toBe('v=spf1 ?all')
    })

    it('should generate complex SPF record', () => {
      const record = generateSpfRecord(
        ['_spf.google.com', 'servers.mcsv.net'],
        ['ip4:192.168.1.0/24', 'mx'],
        '-'
      )
      expect(record).toBe(
        'v=spf1 ip4:192.168.1.0/24 mx include:_spf.google.com include:servers.mcsv.net -all'
      )
    })
  })

  describe('generateDmarcRecord', () => {
    it('should generate basic DMARC record with none policy', () => {
      const record = generateDmarcRecord({ policy: 'none' })
      expect(record).toBe('v=DMARC1; p=none')
    })

    it('should generate DMARC record with quarantine policy', () => {
      const record = generateDmarcRecord({ policy: 'quarantine' })
      expect(record).toBe('v=DMARC1; p=quarantine')
    })

    it('should generate DMARC record with reject policy', () => {
      const record = generateDmarcRecord({ policy: 'reject' })
      expect(record).toBe('v=DMARC1; p=reject')
    })

    it('should include subdomain policy', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        subdomain_policy: 'quarantine',
      })
      expect(record).toBe('v=DMARC1; p=reject; sp=quarantine')
    })

    it('should include percentage when not 100', () => {
      const record = generateDmarcRecord({
        policy: 'quarantine',
        percentage: 50,
      })
      expect(record).toBe('v=DMARC1; p=quarantine; pct=50')
    })

    it('should not include percentage when 100', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        percentage: 100,
      })
      expect(record).toBe('v=DMARC1; p=reject')
    })

    it('should include rua for aggregate reports', () => {
      const record = generateDmarcRecord({
        policy: 'none',
        rua: 'dmarc@example.com',
      })
      expect(record).toBe('v=DMARC1; p=none; rua=mailto:dmarc@example.com')
    })

    it('should include ruf for forensic reports', () => {
      const record = generateDmarcRecord({
        policy: 'none',
        ruf: 'forensic@example.com',
      })
      expect(record).toBe('v=DMARC1; p=none; ruf=mailto:forensic@example.com')
    })

    it('should include aspf for SPF alignment', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        aspf: 'r',
      })
      expect(record).toBe('v=DMARC1; p=reject; aspf=r')
    })

    it('should include strict SPF alignment', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        aspf: 's',
      })
      expect(record).toBe('v=DMARC1; p=reject; aspf=s')
    })

    it('should include adkim for DKIM alignment', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        adkim: 'r',
      })
      expect(record).toBe('v=DMARC1; p=reject; adkim=r')
    })

    it('should include strict DKIM alignment', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        adkim: 's',
      })
      expect(record).toBe('v=DMARC1; p=reject; adkim=s')
    })

    it('should generate complete DMARC record', () => {
      const record = generateDmarcRecord({
        policy: 'reject',
        subdomain_policy: 'quarantine',
        percentage: 75,
        rua: 'dmarc@example.com',
        ruf: 'forensic@example.com',
        aspf: 's',
        adkim: 's',
      })
      expect(record).toBe(
        'v=DMARC1; p=reject; sp=quarantine; pct=75; rua=mailto:dmarc@example.com; ruf=mailto:forensic@example.com; aspf=s; adkim=s'
      )
    })

    it('should handle percentage of 0', () => {
      const record = generateDmarcRecord({
        policy: 'quarantine',
        percentage: 0,
      })
      expect(record).toBe('v=DMARC1; p=quarantine; pct=0')
    })
  })
})
