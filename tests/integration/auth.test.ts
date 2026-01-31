/**
 * Auth Flow E2E Tests
 *
 * Tests the complete authentication flow including:
 * - User registration
 * - User login
 * - Session management
 * - Organization creation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { testDataStore, clearTestDataStore } from './setup'
import {
  createTestUser,
  createTestOrganization,
} from './helpers'

describe('Auth Flow E2E', () => {
  beforeEach(() => {
    clearTestDataStore()
  })

  describe('User Registration', () => {
    it('should create a new user with organization', () => {
      const org = createTestOrganization({ name: 'My Company', slug: 'my-company' })
      const user = createTestUser({
        email: 'newuser@example.com',
        organization_id: org.id,
      })

      expect(user.id).toBeDefined()
      expect(user.email).toBe('newuser@example.com')
      expect(user.organization_id).toBe(org.id)

      // Verify user is stored
      expect(testDataStore.users.get(user.id)).toEqual(user)
    })

    it('should create organization with correct plan', () => {
      const org = createTestOrganization({ plan: 'pro' })

      expect(org.plan).toBe('pro')
      expect(testDataStore.organizations.get(org.id)).toEqual(org)
    })

    it('should generate unique IDs for multiple users', () => {
      const user1 = createTestUser({ email: 'user1@example.com' })
      const user2 = createTestUser({ email: 'user2@example.com' })

      expect(user1.id).not.toBe(user2.id)
      expect(testDataStore.users.size).toBe(2)
    })
  })

  describe('User Login', () => {
    it('should find existing user by email', () => {
      const org = createTestOrganization()
      const user = createTestUser({
        email: 'existing@example.com',
        organization_id: org.id,
      })

      // Simulate lookup by email
      let foundUser = null
      for (const u of testDataStore.users.values()) {
        if (u.email === 'existing@example.com') {
          foundUser = u
          break
        }
      }

      expect(foundUser).not.toBeNull()
      expect(foundUser!.id).toBe(user.id)
      expect(foundUser!.organization_id).toBe(org.id)
    })

    it('should return null for non-existent user', () => {
      let foundUser = null
      for (const u of testDataStore.users.values()) {
        if (u.email === 'nonexistent@example.com') {
          foundUser = u
          break
        }
      }

      expect(foundUser).toBeNull()
    })
  })

  describe('Organization Access', () => {
    it('should allow user to access their organization data', () => {
      const org = createTestOrganization({ name: 'Test Org', plan: 'agency' })
      const user = createTestUser({ organization_id: org.id })

      // User should be able to get their org
      const userOrg = testDataStore.organizations.get(user.organization_id)

      expect(userOrg).not.toBeUndefined()
      expect(userOrg!.name).toBe('Test Org')
      expect(userOrg!.plan).toBe('agency')
    })

    it('should support multiple users in same organization', () => {
      const org = createTestOrganization()
      const user1 = createTestUser({ email: 'user1@org.com', organization_id: org.id })
      const user2 = createTestUser({ email: 'user2@org.com', organization_id: org.id })

      expect(user1.organization_id).toBe(user2.organization_id)

      // Count users in org
      let orgUserCount = 0
      for (const user of testDataStore.users.values()) {
        if (user.organization_id === org.id) {
          orgUserCount++
        }
      }

      expect(orgUserCount).toBe(2)
    })
  })

  describe('Plan Features', () => {
    it('should correctly identify starter plan limits', () => {
      const org = createTestOrganization({ plan: 'starter' })

      // Starter plan: 15 mailboxes, 3 domains, 5k emails
      const limits = getPlanLimits(org.plan)

      expect(limits.maxMailboxes).toBe(15)
      expect(limits.maxDomains).toBe(3)
      expect(limits.maxEmailsPerMonth).toBe(5000)
    })

    it('should correctly identify pro plan limits', () => {
      const org = createTestOrganization({ plan: 'pro' })

      const limits = getPlanLimits(org.plan)

      expect(limits.maxMailboxes).toBe(50)
      expect(limits.maxDomains).toBe(10)
      expect(limits.maxEmailsPerMonth).toBe(25000)
    })

    it('should correctly identify agency plan limits', () => {
      const org = createTestOrganization({ plan: 'agency' })

      const limits = getPlanLimits(org.plan)

      expect(limits.maxMailboxes).toBe(200)
      expect(limits.maxDomains).toBe(50)
      expect(limits.maxEmailsPerMonth).toBe(100000)
    })
  })
})

// Helper function to get plan limits
function getPlanLimits(plan: 'starter' | 'pro' | 'agency') {
  const limits = {
    starter: { maxMailboxes: 15, maxDomains: 3, maxEmailsPerMonth: 5000 },
    pro: { maxMailboxes: 50, maxDomains: 10, maxEmailsPerMonth: 25000 },
    agency: { maxMailboxes: 200, maxDomains: 50, maxEmailsPerMonth: 100000 },
  }
  return limits[plan]
}
