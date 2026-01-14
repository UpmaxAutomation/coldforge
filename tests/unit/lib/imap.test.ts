import { describe, it, expect } from 'vitest'
import { IMAP_PRESETS, getImapPreset, type ImapConfig } from '@/lib/imap'

describe('imap', () => {
  describe('IMAP_PRESETS', () => {
    it('should have gmail preset', () => {
      expect(IMAP_PRESETS.gmail).toBeDefined()
      expect(IMAP_PRESETS.gmail.host).toBe('imap.gmail.com')
      expect(IMAP_PRESETS.gmail.port).toBe(993)
      expect(IMAP_PRESETS.gmail.secure).toBe(true)
    })

    it('should have outlook preset', () => {
      expect(IMAP_PRESETS.outlook).toBeDefined()
      expect(IMAP_PRESETS.outlook.host).toBe('outlook.office365.com')
      expect(IMAP_PRESETS.outlook.port).toBe(993)
      expect(IMAP_PRESETS.outlook.secure).toBe(true)
    })

    it('should have yahoo preset', () => {
      expect(IMAP_PRESETS.yahoo).toBeDefined()
      expect(IMAP_PRESETS.yahoo.host).toBe('imap.mail.yahoo.com')
      expect(IMAP_PRESETS.yahoo.port).toBe(993)
      expect(IMAP_PRESETS.yahoo.secure).toBe(true)
    })

    it('should have zoho preset', () => {
      expect(IMAP_PRESETS.zoho).toBeDefined()
      expect(IMAP_PRESETS.zoho.host).toBe('imap.zoho.com')
      expect(IMAP_PRESETS.zoho.port).toBe(993)
      expect(IMAP_PRESETS.zoho.secure).toBe(true)
    })

    it('should have 4 total presets', () => {
      expect(Object.keys(IMAP_PRESETS)).toHaveLength(4)
    })

    it('should all use port 993', () => {
      Object.values(IMAP_PRESETS).forEach((preset) => {
        expect(preset.port).toBe(993)
      })
    })

    it('should all use secure connection', () => {
      Object.values(IMAP_PRESETS).forEach((preset) => {
        expect(preset.secure).toBe(true)
      })
    })

    it('should have different hosts for each preset', () => {
      const hosts = Object.values(IMAP_PRESETS).map((p) => p.host)
      const uniqueHosts = new Set(hosts)
      expect(uniqueHosts.size).toBe(hosts.length)
    })
  })

  describe('getImapPreset', () => {
    it('should return gmail preset', () => {
      const preset = getImapPreset('gmail')
      expect(preset).toEqual(IMAP_PRESETS.gmail)
    })

    it('should return outlook preset', () => {
      const preset = getImapPreset('outlook')
      expect(preset).toEqual(IMAP_PRESETS.outlook)
    })

    it('should return yahoo preset', () => {
      const preset = getImapPreset('yahoo')
      expect(preset).toEqual(IMAP_PRESETS.yahoo)
    })

    it('should return zoho preset', () => {
      const preset = getImapPreset('zoho')
      expect(preset).toEqual(IMAP_PRESETS.zoho)
    })

    it('should be case-insensitive', () => {
      expect(getImapPreset('GMAIL')).toEqual(IMAP_PRESETS.gmail)
      expect(getImapPreset('Gmail')).toEqual(IMAP_PRESETS.gmail)
      expect(getImapPreset('OUTLOOK')).toEqual(IMAP_PRESETS.outlook)
      expect(getImapPreset('Yahoo')).toEqual(IMAP_PRESETS.yahoo)
    })

    it('should return undefined for unknown provider', () => {
      expect(getImapPreset('unknown')).toBeUndefined()
      expect(getImapPreset('')).toBeUndefined()
    })

    it('should return undefined for providers without IMAP', () => {
      expect(getImapPreset('sendgrid')).toBeUndefined()
      expect(getImapPreset('mailgun')).toBeUndefined()
    })

    it('should return undefined for non-existent provider', () => {
      expect(getImapPreset('protonmail')).toBeUndefined()
      expect(getImapPreset('aol')).toBeUndefined()
    })
  })

  describe('ImapConfig type', () => {
    it('should allow creating valid config', () => {
      const config: ImapConfig = {
        host: 'imap.example.com',
        port: 993,
        secure: true,
        user: 'user@example.com',
        password: 'password123',
      }

      expect(config.host).toBe('imap.example.com')
      expect(config.port).toBe(993)
      expect(config.secure).toBe(true)
      expect(config.user).toBe('user@example.com')
      expect(config.password).toBe('password123')
    })

    it('should allow non-secure connection config', () => {
      const config: ImapConfig = {
        host: 'imap.example.com',
        port: 143,
        secure: false,
        user: 'user@example.com',
        password: 'password123',
      }

      expect(config.secure).toBe(false)
      expect(config.port).toBe(143)
    })

    it('should work with preset values', () => {
      const preset = IMAP_PRESETS.gmail
      const config: ImapConfig = {
        ...preset,
        user: 'user@gmail.com',
        password: 'app-password',
      } as ImapConfig

      expect(config.host).toBe('imap.gmail.com')
      expect(config.port).toBe(993)
      expect(config.secure).toBe(true)
      expect(config.user).toBe('user@gmail.com')
    })
  })

  describe('IMAP vs SMTP presets comparison', () => {
    it('should have different ports than SMTP (993 vs 587)', () => {
      // IMAP uses 993 for secure, SMTP uses 587 for STARTTLS
      Object.values(IMAP_PRESETS).forEach((preset) => {
        expect(preset.port).toBe(993)
        expect(preset.port).not.toBe(587)
      })
    })

    it('should have different security settings than SMTP', () => {
      // IMAP presets are secure (SSL), SMTP presets use STARTTLS (secure: false)
      Object.values(IMAP_PRESETS).forEach((preset) => {
        expect(preset.secure).toBe(true)
      })
    })
  })
})
