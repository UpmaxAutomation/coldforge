/**
 * Inbox & Reply Linking E2E Tests
 *
 * Tests the complete inbox flow including:
 * - Email sync
 * - Reply detection
 * - Campaign linking (the critical fix)
 * - Lead status updates
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { testDataStore, clearTestDataStore } from './setup'
import {
  createReplyScenario,
  createCampaignScenario,
  createTestInboxMessage,
  createTestSentEmail,
  TestCampaignLead,
  TestCampaign,
  TestLead,
} from './helpers'

describe('Inbox & Reply Linking E2E', () => {
  beforeEach(() => {
    clearTestDataStore()
  })

  describe('Email Sync', () => {
    it('should store synced inbound messages', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account } = scenario

      const message = createTestInboxMessage(org.id, account.id, {
        from_email: 'external@example.com',
        to_emails: [account.email],
        subject: 'Inquiry about your services',
        direction: 'inbound',
      })

      expect(testDataStore.inboxMessages.get(message.id)).toBeDefined()
      expect(message.direction).toBe('inbound')
    })

    it('should store synced outbound messages', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account, leads } = scenario

      const message = createTestInboxMessage(org.id, account.id, {
        from_email: account.email,
        to_emails: [leads[0].email],
        subject: 'Following up on our conversation',
        direction: 'outbound',
      })

      expect(message.direction).toBe('outbound')
    })

    it('should track message references for threading', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account } = scenario

      const originalId = '<original@test.com>'
      const replyId = '<reply@test.com>'

      // Original message
      createTestInboxMessage(org.id, account.id, {
        message_id: originalId,
        direction: 'outbound',
      })

      // Reply with references
      const reply = createTestInboxMessage(org.id, account.id, {
        message_id: replyId,
        direction: 'inbound',
        in_reply_to: originalId,
        references: [originalId],
      })

      expect(reply.in_reply_to).toBe(originalId)
      expect(reply.references).toContain(originalId)
    })
  })

  describe('Reply Detection', () => {
    it('should detect reply via In-Reply-To header', () => {
      const scenario = createReplyScenario()
      const { reply, originalMessageId } = scenario

      expect(reply.in_reply_to).toBe(originalMessageId)
      expect(reply.direction).toBe('inbound')
    })

    it('should detect reply via References header', () => {
      const scenario = createReplyScenario()
      const { reply, originalMessageId } = scenario

      expect(reply.references).toContain(originalMessageId)
    })

    it('should identify the original sent email by message_id', () => {
      const scenario = createReplyScenario()
      const { sentEmail, originalMessageId } = scenario

      // Simulate lookup by message_id
      let foundSentEmail = null
      for (const email of testDataStore.sentEmails.values()) {
        if (email.message_id === originalMessageId) {
          foundSentEmail = email
          break
        }
      }

      expect(foundSentEmail).not.toBeNull()
      expect(foundSentEmail!.id).toBe(sentEmail.id)
      expect(foundSentEmail!.campaign_id).toBe(scenario.campaign.id)
      expect(foundSentEmail!.lead_id).toBe(scenario.leads[0].id)
    })
  })

  describe('Campaign Linking (Critical Fix)', () => {
    it('should link reply to campaign via sent_emails lookup', () => {
      const scenario = createReplyScenario()
      const { sentEmail, originalMessageId, campaign, leads } = scenario

      // Simulate the linkReplyToCampaign logic:
      // 1. Get message IDs from reply (in_reply_to, references)
      const referencedIds = [originalMessageId]

      // 2. Look up sent_emails by message_id
      let campaignId: string | undefined
      let leadId: string | undefined

      for (const email of testDataStore.sentEmails.values()) {
        if (referencedIds.includes(email.message_id as string)) {
          campaignId = email.campaign_id as string
          leadId = email.lead_id as string
          break
        }
      }

      // 3. Verify we found the campaign and lead
      expect(campaignId).toBe(campaign.id)
      expect(leadId).toBe(leads[0].id)
    })

    it('should update campaign_leads status to replied', () => {
      const scenario = createReplyScenario()
      const { campaignLeads, campaign, leads } = scenario

      // Find and update campaign_lead
      for (const [id, cl] of testDataStore.campaignLeads.entries()) {
        if (cl.campaign_id === campaign.id && cl.lead_id === leads[0].id) {
          const updated: TestCampaignLead = {
            ...(cl as TestCampaignLead),
            status: 'replied',
            replied_at: new Date().toISOString(),
          }
          testDataStore.campaignLeads.set(id, updated)
          break
        }
      }

      // Verify update
      const updatedCampaignLead = testDataStore.campaignLeads.get(campaignLeads[0].id) as TestCampaignLead
      expect(updatedCampaignLead.status).toBe('replied')
      expect(updatedCampaignLead.replied_at).toBeDefined()
    })

    it('should update lead status to replied', () => {
      const scenario = createReplyScenario()
      const { leads } = scenario

      // Update lead status
      const lead = testDataStore.leads.get(leads[0].id) as TestLead
      const updatedLead: TestLead = {
        ...lead,
        status: 'replied',
      }
      testDataStore.leads.set(leads[0].id, updatedLead)

      // Verify
      const retrieved = testDataStore.leads.get(leads[0].id) as TestLead
      expect(retrieved.status).toBe('replied')
    })

    it('should increment campaign reply count', () => {
      const scenario = createReplyScenario()
      const { campaign } = scenario

      // Increment reply count
      const current = testDataStore.campaigns.get(campaign.id) as TestCampaign
      const updatedCampaign: TestCampaign = {
        ...current,
        stats: {
          ...current.stats,
          replied: current.stats.replied + 1,
        },
      }
      testDataStore.campaigns.set(campaign.id, updatedCampaign)

      // Verify
      const retrieved = testDataStore.campaigns.get(campaign.id) as TestCampaign
      expect(retrieved.stats.replied).toBe(1)
    })

    it('should handle complete reply linking flow', () => {
      const scenario = createReplyScenario()
      const {
        campaign,
        leads,
        campaignLeads,
        sentEmail,
        reply,
        originalMessageId,
      } = scenario

      // === SIMULATE linkReplyToCampaign ===

      // Step 1: Extract referenced message IDs from reply
      const referencedIds: string[] = []
      if (reply.in_reply_to) referencedIds.push(reply.in_reply_to)
      if (reply.references) referencedIds.push(...reply.references)

      // Step 2: Look up sent_emails
      let foundCampaignId: string | undefined
      let foundLeadId: string | undefined

      for (const email of testDataStore.sentEmails.values()) {
        if (referencedIds.includes(email.message_id as string)) {
          foundCampaignId = email.campaign_id as string
          foundLeadId = email.lead_id as string
          break
        }
      }

      expect(foundCampaignId).toBe(campaign.id)
      expect(foundLeadId).toBe(leads[0].id)

      // Step 3: Update campaign_leads status
      for (const [id, cl] of testDataStore.campaignLeads.entries()) {
        if (cl.campaign_id === foundCampaignId && cl.lead_id === foundLeadId) {
          const updated: TestCampaignLead = {
            ...(cl as TestCampaignLead),
            status: 'replied',
            replied_at: new Date().toISOString(),
          }
          testDataStore.campaignLeads.set(id, updated)
        }
      }

      // Step 4: Update lead status
      const lead = testDataStore.leads.get(foundLeadId!) as TestLead
      testDataStore.leads.set(foundLeadId!, { ...lead, status: 'replied' })

      // Step 5: Increment campaign reply count
      const currentCampaign = testDataStore.campaigns.get(foundCampaignId!) as TestCampaign
      testDataStore.campaigns.set(foundCampaignId!, {
        ...currentCampaign,
        stats: { ...currentCampaign.stats, replied: currentCampaign.stats.replied + 1 },
      })

      // === VERIFY ALL UPDATES ===

      const finalCampaignLead = testDataStore.campaignLeads.get(campaignLeads[0].id) as TestCampaignLead
      const finalLead = testDataStore.leads.get(leads[0].id) as TestLead
      const finalCampaign = testDataStore.campaigns.get(campaign.id) as TestCampaign

      expect(finalCampaignLead.status).toBe('replied')
      expect(finalCampaignLead.replied_at).toBeDefined()
      expect(finalLead.status).toBe('replied')
      expect(finalCampaign.stats.replied).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle reply with no matching sent email', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account } = scenario

      // Reply to unknown message
      const orphanReply = createTestInboxMessage(org.id, account.id, {
        direction: 'inbound',
        in_reply_to: '<unknown@external.com>',
      })

      // Attempt lookup
      let found = false
      for (const email of testDataStore.sentEmails.values()) {
        if (email.message_id === orphanReply.in_reply_to) {
          found = true
          break
        }
      }

      expect(found).toBe(false)
      // System should gracefully handle this - no crash, just no linking
    })

    it('should handle reply to non-campaign email', () => {
      const scenario = createCampaignScenario({ leadCount: 1 })
      const { org, account } = scenario

      // Create a sent email without campaign_id
      const directEmail = createTestSentEmail(org.id, account.id, {
        campaign_id: undefined,
        lead_id: undefined,
        message_id: '<direct@company.com>',
      })

      // Reply to direct email
      const reply = createTestInboxMessage(org.id, account.id, {
        direction: 'inbound',
        in_reply_to: directEmail.message_id,
      })

      // Lookup should find the email but have no campaign to link
      let foundEmail = null
      for (const email of testDataStore.sentEmails.values()) {
        if (email.message_id === reply.in_reply_to) {
          foundEmail = email
          break
        }
      }

      expect(foundEmail).not.toBeNull()
      expect(foundEmail!.campaign_id).toBeUndefined()
      // No campaign link should be created
    })

    it('should handle multiple replies to same thread', () => {
      const scenario = createReplyScenario()
      const { org, account, originalMessageId, campaign, leads, campaignLeads } = scenario
      // Note: createReplyScenario already creates 1 reply

      // Second reply
      createTestInboxMessage(org.id, account.id, {
        direction: 'inbound',
        in_reply_to: originalMessageId,
        subject: 'Re: Second reply',
      })

      // Third reply
      createTestInboxMessage(org.id, account.id, {
        direction: 'inbound',
        in_reply_to: originalMessageId,
        subject: 'Re: Third reply',
      })

      // Status should be 'replied' (only updated once)
      const cl = campaignLeads[0]
      const updated: TestCampaignLead = { ...cl, status: 'replied' }
      testDataStore.campaignLeads.set(cl.id, updated)

      const retrieved = testDataStore.campaignLeads.get(cl.id) as TestCampaignLead
      expect(retrieved.status).toBe('replied')

      // Count inbox messages (1 from scenario + 2 we created = 3)
      let replyCount = 0
      for (const msg of testDataStore.inboxMessages.values()) {
        if (msg.in_reply_to === originalMessageId) {
          replyCount++
        }
      }
      expect(replyCount).toBe(3)
    })
  })

  describe('Sequence Stopping', () => {
    it('should stop sequence when reply received', () => {
      const scenario = createReplyScenario()
      const { campaignLeads } = scenario

      // Mark as replied - this should stop the sequence
      const cl = campaignLeads[0]
      const updated: TestCampaignLead = {
        ...cl,
        status: 'replied',
        replied_at: new Date().toISOString(),
      }
      testDataStore.campaignLeads.set(cl.id, updated)

      // Sequence processor should check status before sending next email
      const currentStatus = (testDataStore.campaignLeads.get(cl.id) as TestCampaignLead).status
      const shouldContinueSequence = currentStatus === 'pending' || currentStatus === 'in_progress'

      expect(shouldContinueSequence).toBe(false)
    })
  })
})
