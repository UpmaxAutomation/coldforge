import { render, RenderOptions, RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactElement, ReactNode } from 'react'

// ============================================================================
// Custom Render with Providers
// ============================================================================

interface WrapperProps {
  children: ReactNode
}

/**
 * All providers wrapper for testing.
 * Add providers here as needed (ThemeProvider, QueryClientProvider, etc.)
 */
function AllProviders({ children }: WrapperProps) {
  return <>{children}</>
}

/**
 * Custom render function that wraps components in providers
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options })
}

// ============================================================================
// User Event Setup
// ============================================================================

/**
 * Setup user event with default options
 */
function setupUser() {
  return userEvent.setup()
}

/**
 * Render with user event pre-configured
 */
function renderWithUser(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return {
    user: setupUser(),
    ...customRender(ui, options),
  }
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock user object
 */
function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

interface MockUser {
  id: string
  email: string
  created_at: string
  [key: string]: unknown
}

/**
 * Create a mock campaign object
 */
function createMockCampaign(overrides: Partial<MockCampaign> = {}): MockCampaign {
  return {
    id: 'test-campaign-id',
    name: 'Test Campaign',
    status: 'draft',
    user_id: 'test-user-id',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

interface MockCampaign {
  id: string
  name: string
  status: string
  user_id: string
  created_at: string
  [key: string]: unknown
}

/**
 * Create a mock email account object
 */
function createMockEmailAccount(overrides: Partial<MockEmailAccount> = {}): MockEmailAccount {
  return {
    id: 'test-email-account-id',
    email: 'sender@example.com',
    user_id: 'test-user-id',
    provider: 'gmail',
    is_connected: true,
    daily_limit: 50,
    emails_sent_today: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

interface MockEmailAccount {
  id: string
  email: string
  user_id: string
  provider: string
  is_connected: boolean
  daily_limit: number
  emails_sent_today: number
  created_at: string
  [key: string]: unknown
}

/**
 * Create a mock lead object
 */
function createMockLead(overrides: Partial<MockLead> = {}): MockLead {
  return {
    id: 'test-lead-id',
    email: 'lead@example.com',
    first_name: 'John',
    last_name: 'Doe',
    company: 'Test Corp',
    campaign_id: 'test-campaign-id',
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

interface MockLead {
  id: string
  email: string
  first_name: string
  last_name: string
  company: string
  campaign_id: string
  status: string
  created_at: string
  [key: string]: unknown
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Wait for a condition to be true
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`waitFor timed out after ${timeout}ms`)
}

/**
 * Delay execution for a given number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Mock Response Helpers
// ============================================================================

/**
 * Create a successful Supabase response
 */
function mockSupabaseSuccess<T>(data: T) {
  return { data, error: null }
}

/**
 * Create an error Supabase response
 */
function mockSupabaseError(message: string, code?: string) {
  return {
    data: null,
    error: { message, code: code || 'UNKNOWN_ERROR' },
  }
}

// ============================================================================
// Exports
// ============================================================================

// Re-export testing library utilities
export * from '@testing-library/react'
export { userEvent }

// Export custom utilities
export {
  customRender as render,
  setupUser,
  renderWithUser,
  createMockUser,
  createMockCampaign,
  createMockEmailAccount,
  createMockLead,
  waitFor as waitForCondition,
  delay,
  mockSupabaseSuccess,
  mockSupabaseError,
}
