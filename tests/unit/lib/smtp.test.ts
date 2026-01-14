import { describe, it, expect } from 'vitest'
import { SMTP_PRESETS, getSmtpPreset, type SmtpConfig } from '@/lib/smtp'

describe('smtp', () => {
  describe('SMTP_PRESETS', () => {
    it('should have gmail preset', () => {
      expect(SMTP_PRESETS.gmail).toBeDefined()
      expect(SMTP_PRESETS.gmail.host).toBe('smtp.gmail.com')
      expect(SMTP_PRESETS.gmail.port).toBe(587)
      expect(SMTP_PRESETS.gmail.secure).toBe(false)
    })

    it('should have outlook preset', () => {
      expect(SMTP_PRESETS.outlook).toBeDefined()
      expect(SMTP_PRESETS.outlook.host).toBe('smtp.office365.com')
      expect(SMTP_PRESETS.outlook.port).toBe(587)
      expect(SMTP_PRESETS.outlook.secure).toBe(false)
    })

    it('should have yahoo preset', () => {
      expect(SMTP_PRESETS.yahoo).toBeDefined()
      expect(SMTP_PRESETS.yahoo.host).toBe('smtp.mail.yahoo.com')
      expect(SMTP_PRESETS.yahoo.port).toBe(587)
      expect(SMTP_PRESETS.yahoo.secure).toBe(false)
    })

    it('should have zoho preset', () => {
      expect(SMTP_PRESETS.zoho).toBeDefined()
      expect(SMTP_PRESETS.zoho.host).toBe('smtp.zoho.com')
      expect(SMTP_PRESETS.zoho.port).toBe(587)
      expect(SMTP_PRESETS.zoho.secure).toBe(false)
    })

    it('should have sendgrid preset', () => {
      expect(SMTP_PRESETS.sendgrid).toBeDefined()
      expect(SMTP_PRESETS.sendgrid.host).toBe('smtp.sendgrid.net')
      expect(SMTP_PRESETS.sendgrid.port).toBe(587)
      expect(SMTP_PRESETS.sendgrid.secure).toBe(false)
    })

    it('should have mailgun preset', () => {
      expect(SMTP_PRESETS.mailgun).toBeDefined()
      expect(SMTP_PRESETS.mailgun.host).toBe('smtp.mailgun.org')
      expect(SMTP_PRESETS.mailgun.port).toBe(587)
      expect(SMTP_PRESETS.mailgun.secure).toBe(false)
    })

    it('should have 6 total presets', () => {
      expect(Object.keys(SMTP_PRESETS)).toHaveLength(6)
    })

    it('should all use port 587', () => {
      Object.values(SMTP_PRESETS).forEach((preset) => {
        expect(preset.port).toBe(587)
      })
    })

    it('should all use non-secure connection', () => {
      Object.values(SMTP_PRESETS).forEach((preset) => {
        expect(preset.secure).toBe(false)
      })
    })
  })

  describe('getSmtpPreset', () => {
    it('should return gmail preset', () => {
      const preset = getSmtpPreset('gmail')
      expect(preset).toEqual(SMTP_PRESETS.gmail)
    })

    it('should return outlook preset', () => {
      const preset = getSmtpPreset('outlook')
      expect(preset).toEqual(SMTP_PRESETS.outlook)
    })

    it('should return yahoo preset', () => {
      const preset = getSmtpPreset('yahoo')
      expect(preset).toEqual(SMTP_PRESETS.yahoo)
    })

    it('should return zoho preset', () => {
      const preset = getSmtpPreset('zoho')
      expect(preset).toEqual(SMTP_PRESETS.zoho)
    })

    it('should return sendgrid preset', () => {
      const preset = getSmtpPreset('sendgrid')
      expect(preset).toEqual(SMTP_PRESETS.sendgrid)
    })

    it('should return mailgun preset', () => {
      const preset = getSmtpPreset('mailgun')
      expect(preset).toEqual(SMTP_PRESETS.mailgun)
    })

    it('should be case-insensitive', () => {
      expect(getSmtpPreset('GMAIL')).toEqual(SMTP_PRESETS.gmail)
      expect(getSmtpPreset('Gmail')).toEqual(SMTP_PRESETS.gmail)
      expect(getSmtpPreset('OUTLOOK')).toEqual(SMTP_PRESETS.outlook)
    })

    it('should return undefined for unknown provider', () => {
      expect(getSmtpPreset('unknown')).toBeUndefined()
      expect(getSmtpPreset('')).toBeUndefined()
    })

    it('should return undefined for non-existent provider', () => {
      expect(getSmtpPreset('protonmail')).toBeUndefined()
      expect(getSmtpPreset('aol')).toBeUndefined()
    })
  })

  describe('SmtpConfig type', () => {
    it('should allow creating valid config', () => {
      const config: SmtpConfig = {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'user@example.com',
        password: 'password123',
      }

      expect(config.host).toBe('smtp.example.com')
      expect(config.port).toBe(587)
      expect(config.secure).toBe(false)
      expect(config.user).toBe('user@example.com')
      expect(config.password).toBe('password123')
    })

    it('should allow secure connection config', () => {
      const config: SmtpConfig = {
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        user: 'user@example.com',
        password: 'password123',
      }

      expect(config.secure).toBe(true)
      expect(config.port).toBe(465)
    })
  })
})
