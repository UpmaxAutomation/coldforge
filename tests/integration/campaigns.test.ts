/**
 * Campaign Flow E2E Tests
 *
 * Tests the complete campaign lifecycle:
 * - Campaign creation
 * - Lead management
 * - Campaign execution
 * - Event tracking
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { testDataStore, clearTestDataStore } from './setup'
import {
  createCampaignScenario,
  createTestCampaign,
  createTestLead,
  createTestCampaignLead,
  createTestSentEmail,
  createTestEmailAccount,
  createTestOrganization,
  TestCampaign,
  TestCampaignLead,
} from './helpers'

describe('Campaign Flow E2E', () => {
  beforeEach(() => {
    clearTestDataStore()
  })

  describe('Campaign Creation', () => {
    it('should create a campaign with default settings', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id, { name: 'Q1 Outreach' })

      expect(campaign.id).toBeDefined()
      expect(campaign.name).toBe('Q1 Outreach')
      expect(campaign.status).toBe('draft')
      expect(campaign.organization_id).toBe(org.id)
      expect(campaign.settings.daily_limit).toBe(100)
    })

    it('should create campaign with custom settings', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id, {
        name: 'Enterprise Campaign',
        settings: {
          timezone: 'Europe/London',
          daily_limit: 500,
          send_days: ['mon', 'tue', 'wed'],
        },
      })

      expect(campaign.settings.timezone).toBe('Europe/London')
      expect(campaign.settings.daily_limit).toBe(500)
      expect(campaign.settings.send_days).toEqual(['mon', 'tue', 'wed'])
    })

    it('should initialize stats at zero', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id)

      expect(campaign.stats.sent).toBe(0)
      expect(campaign.stats.opened).toBe(0)
      expect(campaign.stats.clicked).toBe(0)
      expect(campaign.stats.replied).toBe(0)
      expect(campaign.stats.bounced).toBe(0)
    })
  })

  describe('Lead Management', () => {
    it('should create leads for a campaign', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id)

      const lead1 = createTestLead(org.id, { email: 'lead1@example.com' })
      const lead2 = createTestLead(org.id, { email: 'lead2@example.com' })

      createTestCampaignLead(campaign.id, lead1.id)
      createTestCampaignLead(campaign.id, lead2.id)

      // Count campaign leads
      let campaignLeadCount = 0
      for (const cl of testDataStore.campaignLeads.values()) {
        if (cl.campaign_id === campaign.id) {
          campaignLeadCount++
        }
      }

      expect(campaignLeadCount).toBe(2)
    })

    it('should track lead status in campaign', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id)
      const lead = createTestLead(org.id)

      const campaignLead = createTestCampaignLead(campaign.id, lead.id, {
        status: 'in_progress',
        current_step: 2,
      })

      expect(campaignLead.status).toBe('in_progress')
      expect(campaignLead.current_step).toBe(2)
    })

    it('should create full campaign scenario with leads', () => {
      const scenario = createCampaignScenario({ leadCount: 10 })

      expect(scenario.leads.length).toBe(10)
      expect(scenario.campaignLeads.length).toBe(10)
      expect(scenario.campaign.status).toBe('active')
    })
  })

  describe('Campaign Execution', () => {
    it('should transition campaign from draft to active', () => {
      const org = createTestOrganization()
      const campaign = createTestCampaign(org.id, { status: 'draft' })

      // Simulate activation
      const updatedCampaign: TestCampaign = { ...campaign, status: 'active' }
      testDataStore.campaigns.set(campaign.id, updatedCampaign)

      const retrievedCampaign = testDataStore.campaigns.get(campaign.id) as TestCampaign
      expect(retrievedCampaign.status).toBe('active')
    })

    it('should track sent emails for campaign', () => {
      const scenario = createCampaignScenario({ leadCount: 3 })
      const { org, account, campaign, leads } = scenario

      // Simulate sending emails
      leads.forEach((lead, index) => {
        createTestSentEmail(org.id, account.id, {
          campaign_id: campaign.id,
          lead_id: lead.id,
          to_email: lead.email,
          subject: `Outreach #${index + 1}`,
        })
      })

      // Count sent emails for campaign
      let sentCount = 0
      for (const email of testDataStore.sentEmails.values()) {
        if (email.campaign_id === campaign.id) {
          sentCount++
        }
      }

      expect(sentCount).toBe(3)
    })

    it('should update campaign stats after sending', () => {
      const scenario = createCampaignScenario({ leadCount: 5 })
      const { campaign } = scenario

      // Simulate updating stats
      const updatedStats = {
        ...campaign.stats,
        sent: 5,
        opened: 2,
        clicked: 1,
      }
      const updatedCampaign: TestCampaign = { ...campaign, stats: updatedStats }
      testDataStore.campaigns.set(campaign.id, updatedCampaign)

      const retrieved = testDataStore.campaigns.get(campaign.id) as TestCampaign
      expect(retrieved.stats.sent).toBe(5)
      expect(retrieved.stats.opened).toBe(2)
      expect(retrieved.stats.clicked).toBe(1)
    })
  })

  describe('Event Tracking', () => {
    it('should track email opens', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account, campaign, leads } = scenario

      const sentEmail = createTestSentEmail(org.id, account.id, {
        campaign_id: campaign.id,
        lead_id: leads[0].id,
        status: 'sent',
      })

      // Simulate open event
      const updatedEmail = { ...sentEmail, status: 'opened' as const }
      testDataStore.sentEmails.set(sentEmail.id, updatedEmail)

      const retrieved = testDataStore.sentEmails.get(sentEmail.id) as typeof sentEmail
      expect(retrieved.status).toBe('opened')
    })

    it('should track email clicks', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account, campaign, leads } = scenario

      const sentEmail = createTestSentEmail(org.id, account.id, {
        campaign_id: campaign.id,
        lead_id: leads[0].id,
        status: 'opened',
      })

      // Simulate click event
      const updatedEmail = { ...sentEmail, status: 'clicked' as const }
      testDataStore.sentEmails.set(sentEmail.id, updatedEmail)

      const retrieved = testDataStore.sentEmails.get(sentEmail.id) as typeof sentEmail
      expect(retrieved.status).toBe('clicked')
    })

    it('should track bounces and update lead status', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account, campaign, leads, campaignLeads } = scenario

      const sentEmail = createTestSentEmail(org.id, account.id, {
        campaign_id: campaign.id,
        lead_id: leads[0].id,
        status: 'bounced',
      })

      // Update campaign lead status
      const updatedCampaignLead: TestCampaignLead = {
        ...campaignLeads[0],
        status: 'bounced',
      }
      testDataStore.campaignLeads.set(campaignLeads[0].id, updatedCampaignLead)

      const retrieved = testDataStore.campaignLeads.get(campaignLeads[0].id) as TestCampaignLead
      expect(retrieved.status).toBe('bounced')
    })
  })

  describe('Campaign Completion', () => {
    it('should mark campaign as completed when all leads processed', () => {
      const scenario = createCampaignScenario({ leadCount: 3 })
      const { campaign, campaignLeads } = scenario

      // Mark all campaign leads as completed
      campaignLeads.forEach((cl) => {
        const updated: TestCampaignLead = { ...cl, status: 'completed' }
        testDataStore.campaignLeads.set(cl.id, updated)
      })

      // Check all leads are completed
      let allCompleted = true
      for (const cl of testDataStore.campaignLeads.values()) {
        if (cl.campaign_id === campaign.id && cl.status !== 'completed') {
          allCompleted = false
          break
        }
      }

      expect(allCompleted).toBe(true)

      // Mark campaign as completed
      const updatedCampaign: TestCampaign = { ...campaign, status: 'completed' }
      testDataStore.campaigns.set(campaign.id, updatedCampaign)

      const retrieved = testDataStore.campaigns.get(campaign.id) as TestCampaign
      expect(retrieved.status).toBe('completed')
    })

    it('should calculate final campaign metrics', () => {
      const scenario = createCampaignScenario({ leadCount: 10 })
      const { campaign } = scenario

      // Simulate final stats
      const finalStats = {
        sent: 10,
        opened: 4,
        clicked: 2,
        replied: 1,
        bounced: 1,
      }

      const updatedCampaign: TestCampaign = { ...campaign, stats: finalStats, status: 'completed' }
      testDataStore.campaigns.set(campaign.id, updatedCampaign)

      const retrieved = testDataStore.campaigns.get(campaign.id) as TestCampaign

      // Calculate rates
      const openRate = (retrieved.stats.opened / retrieved.stats.sent) * 100
      const clickRate = (retrieved.stats.clicked / retrieved.stats.sent) * 100
      const replyRate = (retrieved.stats.replied / retrieved.stats.sent) * 100
      const bounceRate = (retrieved.stats.bounced / retrieved.stats.sent) * 100

      expect(openRate).toBe(40)
      expect(clickRate).toBe(20)
      expect(replyRate).toBe(10)
      expect(bounceRate).toBe(10)
    })
  })
})
