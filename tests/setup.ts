import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'
import { createMockSupabaseClient, clearMockData } from './mocks/supabase'

// ============================================================================
// Global Test State
// ============================================================================

// Global mock Supabase client that can be configured per-test
export let mockSupabase = createMockSupabaseClient()

// Reset mock client before each test
beforeEach(() => {
  mockSupabase = createMockSupabaseClient()
  clearMockData()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// Next.js Mocks
// ============================================================================

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
  }),
  headers: () => new Headers(),
}))

// ============================================================================
// Supabase Mocks
// ============================================================================

// Mock browser client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

// Mock server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}))

// ============================================================================
// Environment Variables
// ============================================================================

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
vi.stubEnv('ENCRYPTION_SECRET', 'test-encryption-secret-32-characters!')
vi.stubEnv('ENCRYPTION_SALT', 'test-salt')
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock')
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_mock')
vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf_test_token')
vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf_account_123')

// ============================================================================
// Utility Exports for Tests
// ============================================================================

export { createMockSupabaseClient, clearMockData } from './mocks/supabase'
export * from './factories'
export * from './fixtures'
