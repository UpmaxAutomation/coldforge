import { describe, it, expect, vi } from 'vitest'
import {
  createMockUser,
  createMockCampaign,
  createMockEmailAccount,
  createMockLead,
  mockSupabaseSuccess,
  mockSupabaseError,
  delay,
} from '../utils'

describe('Test Setup Verification', () => {
  it('should have vitest globals available', () => {
    expect(describe).toBeDefined()
    expect(it).toBeDefined()
    expect(expect).toBeDefined()
    expect(vi).toBeDefined()
  })

  it('should have mock utilities working', () => {
    const mockFn = vi.fn()
    mockFn('test')
    expect(mockFn).toHaveBeenCalledWith('test')
  })
})

describe('Mock Factory Functions', () => {
  it('should create mock user with defaults', () => {
    const user = createMockUser()
    expect(user.id).toBe('test-user-id')
    expect(user.email).toBe('test@example.com')
    expect(user.created_at).toBeDefined()
  })

  it('should create mock user with overrides', () => {
    const user = createMockUser({ email: 'custom@example.com' })
    expect(user.email).toBe('custom@example.com')
    expect(user.id).toBe('test-user-id') // default preserved
  })

  it('should create mock campaign', () => {
    const campaign = createMockCampaign({ name: 'My Campaign' })
    expect(campaign.name).toBe('My Campaign')
    expect(campaign.status).toBe('draft')
  })

  it('should create mock email account', () => {
    const account = createMockEmailAccount()
    expect(account.email).toBe('sender@example.com')
    expect(account.provider).toBe('gmail')
    expect(account.daily_limit).toBe(50)
  })

  it('should create mock lead', () => {
    const lead = createMockLead({ first_name: 'Jane' })
    expect(lead.first_name).toBe('Jane')
    expect(lead.last_name).toBe('Doe')
    expect(lead.status).toBe('pending')
  })
})

describe('Supabase Response Helpers', () => {
  it('should create success response', () => {
    const response = mockSupabaseSuccess({ id: '123' })
    expect(response.data).toEqual({ id: '123' })
    expect(response.error).toBeNull()
  })

  it('should create error response', () => {
    const response = mockSupabaseError('Not found', '404')
    expect(response.data).toBeNull()
    expect(response.error.message).toBe('Not found')
    expect(response.error.code).toBe('404')
  })
})

describe('Async Utilities', () => {
  it('should delay execution', async () => {
    const start = Date.now()
    await delay(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // Allow some tolerance
  })
})
