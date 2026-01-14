/**
 * Tests for Supabase mocks and data factories
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockSupabaseClient,
  createMockQueryBuilder,
  createMockAuth,
  createMockRealtimeChannel,
  setMockData,
  getMockData,
  clearMockData,
  mockQueryResponse,
  mockQueryError,
  mockLoggedInUser,
  mockLoggedOutUser,
  type MockSupabaseClient,
} from '../mocks/supabase'
import {
  createMockUser,
  createMockOrganization,
  createMockEmailAccount,
  createMockCampaign,
  createMockLead,
  createMockSentEmail,
  createMockLeadList,
  createMockDomain,
  createMockCampaignSequence,
  createMockSupabaseUser,
  createMockUsers,
  createMockLeads,
  createMockOrganizationScenario,
  createMockCampaignScenario,
} from '../factories'
import {
  FIXTURE_IDS,
  organizationFixtures,
  userFixtures,
  campaignFixtures,
  leadFixtures,
  supabaseUserFixtures,
  getProOrgFixtures,
  fixturesAsArrays,
} from '../fixtures'

// ============================================================================
// Mock Query Builder Tests
// ============================================================================

describe('MockQueryBuilder', () => {
  it('should chain query methods', () => {
    const builder = createMockQueryBuilder([{ id: '1', name: 'Test' }])

    const result = builder
      .select('*')
      .eq('id', '1')
      .order('name', { ascending: true })
      .limit(10)

    expect(result).toBe(builder)
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.eq).toHaveBeenCalledWith('id', '1')
  })

  it('should return single result', async () => {
    const testData = [{ id: '1', name: 'Test Item' }]
    const builder = createMockQueryBuilder(testData)

    const { data, error } = await builder.single()

    expect(error).toBeNull()
    expect(data).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return null for empty results on single()', async () => {
    const builder = createMockQueryBuilder([])

    const { data, error } = await builder.single()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('should support then() for array results', async () => {
    const testData = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ]
    const builder = createMockQueryBuilder(testData)

    const result = await builder
    expect(result.data).toEqual(testData)
    expect(result.error).toBeNull()
  })

  it('should track insert operations', () => {
    const builder = createMockQueryBuilder<{ id: string; name: string }>([])

    builder.insert({ id: '1', name: 'New Item' })

    expect(builder.insert).toHaveBeenCalledWith({ id: '1', name: 'New Item' })
  })
})

// ============================================================================
// Mock Auth Tests
// ============================================================================

describe('MockAuth', () => {
  it('should return user when logged in', async () => {
    const mockUser = createMockSupabaseUser({ email: 'test@example.com' })
    const auth = createMockAuth(mockUser)

    const { data } = await auth.getUser()

    expect(data.user).toEqual(mockUser)
  })

  it('should return null when logged out', async () => {
    const auth = createMockAuth(null)

    const { data } = await auth.getUser()

    expect(data.user).toBeNull()
  })

  it('should simulate sign in', async () => {
    const auth = createMockAuth()

    const { data, error } = await auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password',
    })

    expect(error).toBeNull()
    expect(data.user).toBeDefined()
    expect(data.user?.email).toBe('test@example.com')
  })

  it('should simulate sign out', async () => {
    const mockUser = createMockSupabaseUser()
    const auth = createMockAuth(mockUser)

    await auth.signOut()

    const { data } = await auth.getUser()
    expect(data.user).toBeNull()
  })

  it('should call auth state change listeners', async () => {
    const auth = createMockAuth()
    const callback = vi.fn()

    auth.onAuthStateChange(callback)

    // Initial call
    expect(callback).toHaveBeenCalled()

    // Sign in should trigger
    await auth.signInWithPassword({ email: 'test@example.com', password: 'pass' })
    expect(callback).toHaveBeenCalledWith('SIGNED_IN', expect.any(Object))
  })
})

// ============================================================================
// Mock Realtime Tests
// ============================================================================

describe('MockRealtimeChannel', () => {
  it('should chain subscription methods', () => {
    const channel = createMockRealtimeChannel()

    const result = channel
      .on('INSERT', { table: 'leads' }, () => {})
      .subscribe()

    expect(result).toBe(channel)
    expect(channel.on).toHaveBeenCalled()
    expect(channel.subscribe).toHaveBeenCalled()
  })

  it('should call subscribe callback', () => {
    const channel = createMockRealtimeChannel()
    const callback = vi.fn()

    channel.subscribe(callback)

    expect(callback).toHaveBeenCalledWith('SUBSCRIBED')
  })
})

// ============================================================================
// Full Mock Client Tests
// ============================================================================

describe('MockSupabaseClient', () => {
  let client: MockSupabaseClient

  beforeEach(() => {
    clearMockData()
    client = createMockSupabaseClient()
  })

  it('should create a complete mock client', () => {
    expect(client.auth).toBeDefined()
    expect(client.from).toBeDefined()
    expect(client.channel).toBeDefined()
    expect(client.rpc).toBeDefined()
    expect(client.storage).toBeDefined()
  })

  it('should support from() queries', async () => {
    setMockData('users', [createMockUser({ email: 'test@example.com' })])

    const { data } = await client.from('users').select('*')

    expect(data).toHaveLength(1)
    expect(data?.[0].email).toBe('test@example.com')
  })

  it('should support mockQueryResponse helper', async () => {
    const testCampaigns = [
      createMockCampaign({ name: 'Campaign 1' }),
      createMockCampaign({ name: 'Campaign 2' }),
    ]

    mockQueryResponse(client, 'campaigns', testCampaigns)

    const { data } = await client.from('campaigns').select('*')

    expect(data).toHaveLength(2)
    expect(data?.[0].name).toBe('Campaign 1')
  })

  it('should support mockQueryError helper', async () => {
    mockQueryError(client, 'leads', {
      message: 'Permission denied',
      code: '42501',
      details: 'RLS policy violation',
      hint: 'Check your access rights',
    })

    const { data, error } = await client.from('leads').select('*').single()

    expect(data).toBeNull()
    expect(error?.message).toBe('Permission denied')
  })

  it('should support mockLoggedInUser helper', async () => {
    const user = createMockSupabaseUser({ email: 'owner@test.com' })

    mockLoggedInUser(client, user)

    const { data } = await client.auth.getUser()
    expect(data.user?.email).toBe('owner@test.com')
  })

  it('should support mockLoggedOutUser helper', async () => {
    const user = createMockSupabaseUser()
    client = createMockSupabaseClient({ user })

    mockLoggedOutUser(client)

    const { data } = await client.auth.getUser()
    expect(data.user).toBeNull()
  })

  it('should support storage operations', async () => {
    const bucket = client.storage.from('avatars')
    const testBlob = new Blob(['test'], { type: 'image/png' })

    await bucket.upload('user123/avatar.png', testBlob)

    const { data: listData } = await bucket.list('user123')
    expect(listData).toHaveLength(1)

    const { data: urlData } = bucket.getPublicUrl('user123/avatar.png')
    expect(urlData.publicUrl).toContain('user123/avatar.png')
  })
})

// ============================================================================
// Factory Tests
// ============================================================================

describe('Data Factories', () => {
  describe('createMockUser', () => {
    it('should create a user with default values', () => {
      const user = createMockUser()

      expect(user.id).toBeDefined()
      expect(user.email).toContain('@')
      expect(user.role).toBe('member')
      expect(user.created_at).toBeDefined()
    })

    it('should accept custom values', () => {
      const user = createMockUser({
        email: 'custom@test.com',
        role: 'admin',
        fullName: 'Custom User',
      })

      expect(user.email).toBe('custom@test.com')
      expect(user.role).toBe('admin')
      expect(user.full_name).toBe('Custom User')
    })
  })

  describe('createMockOrganization', () => {
    it('should create an organization with default values', () => {
      const org = createMockOrganization()

      expect(org.id).toBeDefined()
      expect(org.name).toBeDefined()
      expect(org.slug).toBeDefined()
      expect(org.plan).toBe('starter')
    })

    it('should generate slug from name', () => {
      const org = createMockOrganization({ name: 'My Test Company' })

      expect(org.slug).toBe('my-test-company')
    })
  })

  describe('createMockEmailAccount', () => {
    it('should create SMTP account with connection details', () => {
      const account = createMockEmailAccount({ provider: 'smtp' })

      expect(account.provider).toBe('smtp')
      expect(account.smtp_host).toBeDefined()
      expect(account.smtp_port).toBe(587)
      expect(account.oauth_tokens_encrypted).toBeNull()
    })

    it('should create OAuth account without SMTP details', () => {
      const account = createMockEmailAccount({ provider: 'google' })

      expect(account.provider).toBe('google')
      expect(account.smtp_host).toBeNull()
      expect(account.oauth_tokens_encrypted).toBeDefined()
    })
  })

  describe('createMockCampaign', () => {
    it('should create campaign with default stats', () => {
      const campaign = createMockCampaign()

      expect(campaign.status).toBe('draft')
      expect(campaign.stats).toMatchObject({
        sent: 0,
        delivered: 0,
        opened: 0,
      })
    })
  })

  describe('createMockLead', () => {
    it('should generate realistic lead data', () => {
      const lead = createMockLead()

      expect(lead.email).toContain('@')
      expect(lead.first_name).toBeDefined()
      expect(lead.last_name).toBeDefined()
      expect(lead.company).toBeDefined()
      expect(lead.status).toBe('active')
    })
  })

  describe('createMockSentEmail', () => {
    it('should create sent email with timestamps', () => {
      const email = createMockSentEmail({ status: 'opened' })

      expect(email.status).toBe('opened')
      expect(email.sent_at).toBeDefined()
      expect(email.opened_at).toBeDefined()
    })
  })

  describe('Batch factories', () => {
    it('should create multiple users', () => {
      const users = createMockUsers(5)

      expect(users).toHaveLength(5)
      users.forEach((user) => {
        expect(user.id).toBeDefined()
        expect(user.email).toContain('@')
      })
    })

    it('should create multiple leads with shared organization', () => {
      const orgId = 'shared-org-id'
      const leads = createMockLeads(10, { organizationId: orgId })

      expect(leads).toHaveLength(10)
      leads.forEach((lead) => {
        expect(lead.organization_id).toBe(orgId)
      })
    })
  })

  describe('Scenario factories', () => {
    it('should create complete organization scenario', () => {
      const scenario = createMockOrganizationScenario({
        memberCount: 3,
        emailAccountCount: 2,
        domainCount: 1,
      })

      expect(scenario.organization).toBeDefined()
      expect(scenario.owner.role).toBe('owner')
      expect(scenario.members).toHaveLength(3)
      expect(scenario.emailAccounts).toHaveLength(2)
      expect(scenario.domains).toHaveLength(1)

      // All should have same org ID
      expect(scenario.owner.organization_id).toBe(scenario.organization.id)
      scenario.members.forEach((m) => {
        expect(m.organization_id).toBe(scenario.organization.id)
      })
    })

    it('should create complete campaign scenario', () => {
      const scenario = createMockCampaignScenario('org-123', {
        leadCount: 5,
        sequenceSteps: 2,
        sentEmailsPerLead: 2,
      })

      expect(scenario.campaign).toBeDefined()
      expect(scenario.sequences).toHaveLength(2)
      expect(scenario.leads).toHaveLength(5)
      expect(scenario.sentEmails).toHaveLength(10) // 5 leads * 2 emails
    })
  })
})

// ============================================================================
// Fixtures Tests
// ============================================================================

describe('Test Fixtures', () => {
  it('should have consistent IDs', () => {
    expect(FIXTURE_IDS.ORG_PRO).toBe('00000000-0000-0000-0000-000000000002')
    expect(FIXTURE_IDS.USER_OWNER).toBe('11111111-1111-1111-1111-111111111001')
  })

  it('should have valid organization fixtures', () => {
    expect(organizationFixtures.starterOrg.plan).toBe('starter')
    expect(organizationFixtures.proOrg.plan).toBe('pro')
    expect(organizationFixtures.agencyOrg.plan).toBe('agency')
  })

  it('should have related user fixtures', () => {
    expect(userFixtures.ownerUser.organization_id).toBe(FIXTURE_IDS.ORG_PRO)
    expect(userFixtures.ownerUser.role).toBe('owner')
    expect(userFixtures.noOrgUser.organization_id).toBeNull()
  })

  it('should have campaign fixtures with different statuses', () => {
    expect(campaignFixtures.draftCampaign.status).toBe('draft')
    expect(campaignFixtures.activeCampaign.status).toBe('active')
    expect(campaignFixtures.pausedCampaign.status).toBe('paused')
    expect(campaignFixtures.completedCampaign.status).toBe('completed')
  })

  it('should have lead fixtures with different statuses', () => {
    expect(leadFixtures.activeLead1.status).toBe('active')
    expect(leadFixtures.bouncedLead.status).toBe('bounced')
    expect(leadFixtures.unsubscribedLead.status).toBe('unsubscribed')
  })

  it('should have Supabase user fixtures', () => {
    expect(supabaseUserFixtures.authenticatedUser.email).toBeDefined()
    expect(supabaseUserFixtures.authenticatedUser.aud).toBe('authenticated')
  })

  describe('getProOrgFixtures', () => {
    it('should return all fixtures for Pro organization', () => {
      const fixtures = getProOrgFixtures()

      expect(fixtures.organization?.id).toBe(FIXTURE_IDS.ORG_PRO)
      expect(fixtures.users.length).toBeGreaterThan(0)
      expect(fixtures.emailAccounts.length).toBeGreaterThan(0)
      expect(fixtures.campaigns.length).toBeGreaterThan(0)
    })
  })

  describe('fixturesAsArrays', () => {
    it('should convert all fixtures to arrays', () => {
      const arrays = fixturesAsArrays()

      expect(Array.isArray(arrays.organizations)).toBe(true)
      expect(Array.isArray(arrays.users)).toBe(true)
      expect(Array.isArray(arrays.campaigns)).toBe(true)
      expect(arrays.organizations.length).toBe(3)
    })
  })
})

// ============================================================================
// Integration: Mocks + Factories + Fixtures
// ============================================================================

describe('Integration: Mocks with Factories and Fixtures', () => {
  it('should use fixtures with mock client', async () => {
    const client = createMockSupabaseClient()
    setMockData('organizations', [organizationFixtures.proOrg])
    setMockData('users', [userFixtures.ownerUser, userFixtures.adminUser])

    const { data: orgs } = await client.from('organizations').select('*')
    const { data: users } = await client.from('users').select('*')

    expect(orgs).toHaveLength(1)
    expect(orgs?.[0].name).toBe('Pro Solutions')
    expect(users).toHaveLength(2)
  })

  it('should use factories for dynamic test data', async () => {
    const client = createMockSupabaseClient()
    const dynamicLeads = createMockLeads(50, { status: 'active' })
    setMockData('leads', dynamicLeads)

    const { data } = await client.from('leads').select('*')

    expect(data).toHaveLength(50)
    data?.forEach((lead) => {
      expect(lead.status).toBe('active')
    })
  })

  it('should combine auth and data mocks', async () => {
    const user = supabaseUserFixtures.authenticatedUser
    const client = createMockSupabaseClient({ user })

    mockLoggedInUser(client, user)
    setMockData('campaigns', [campaignFixtures.activeCampaign])

    const { data: authData } = await client.auth.getUser()
    const { data: campaignData } = await client.from('campaigns').select('*')

    expect(authData.user?.id).toBe(user.id)
    expect(campaignData).toHaveLength(1)
    expect(campaignData?.[0].status).toBe('active')
  })
})

// Import vi for the test file
import { vi } from 'vitest'
