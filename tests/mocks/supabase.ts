/**
 * Mock Supabase client for testing
 * Provides type-safe mocks that match the Supabase client interface
 */
import { vi, type Mock } from 'vitest'
import type { Database } from '@/types/database'
import type { User as SupabaseUser, Session, AuthError } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export type TableName = keyof Database['public']['Tables']

export interface MockQueryBuilder<T = unknown> {
  select: Mock<(columns?: string) => MockQueryBuilder<T>>
  insert: Mock<(values: T | T[]) => MockQueryBuilder<T>>
  update: Mock<(values: Partial<T>) => MockQueryBuilder<T>>
  delete: Mock<() => MockQueryBuilder<T>>
  upsert: Mock<(values: T | T[]) => MockQueryBuilder<T>>
  eq: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  neq: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  gt: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  gte: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  lt: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  lte: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  like: Mock<(column: string, pattern: string) => MockQueryBuilder<T>>
  ilike: Mock<(column: string, pattern: string) => MockQueryBuilder<T>>
  is: Mock<(column: string, value: null | boolean) => MockQueryBuilder<T>>
  in: Mock<(column: string, values: unknown[]) => MockQueryBuilder<T>>
  contains: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  containedBy: Mock<(column: string, value: unknown) => MockQueryBuilder<T>>
  order: Mock<(column: string, options?: { ascending?: boolean }) => MockQueryBuilder<T>>
  limit: Mock<(count: number) => MockQueryBuilder<T>>
  range: Mock<(from: number, to: number) => MockQueryBuilder<T>>
  single: Mock<() => Promise<{ data: T | null; error: MockPostgrestError | null }>>
  maybeSingle: Mock<() => Promise<{ data: T | null; error: MockPostgrestError | null }>>
  then: <TResult>(
    onfulfilled?: (value: { data: T[] | null; error: MockPostgrestError | null }) => TResult
  ) => Promise<TResult>
}

export interface MockPostgrestError {
  message: string
  details: string
  hint: string
  code: string
}

export interface MockAuthResponse {
  data: {
    user: SupabaseUser | null
    session: Session | null
  }
  error: AuthError | null
}

export interface MockAuth {
  getUser: Mock<() => Promise<{ data: { user: SupabaseUser | null }; error: AuthError | null }>>
  getSession: Mock<() => Promise<{ data: { session: Session | null }; error: AuthError | null }>>
  signUp: Mock<(credentials: { email: string; password: string }) => Promise<MockAuthResponse>>
  signInWithPassword: Mock<(credentials: { email: string; password: string }) => Promise<MockAuthResponse>>
  signInWithOAuth: Mock<(options: { provider: string }) => Promise<{ data: { url: string }; error: AuthError | null }>>
  signOut: Mock<() => Promise<{ error: AuthError | null }>>
  resetPasswordForEmail: Mock<(email: string) => Promise<{ data: object; error: AuthError | null }>>
  updateUser: Mock<(attributes: { email?: string; password?: string }) => Promise<{ data: { user: SupabaseUser | null }; error: AuthError | null }>>
  onAuthStateChange: Mock<(callback: (event: string, session: Session | null) => void) => { data: { subscription: { unsubscribe: () => void } } }>
}

export interface MockRealtimeChannel {
  on: Mock<(event: string, filter: object, callback: (payload: unknown) => void) => MockRealtimeChannel>
  subscribe: Mock<(callback?: (status: string) => void) => MockRealtimeChannel>
  unsubscribe: Mock<() => void>
}

export interface MockSupabaseClient {
  auth: MockAuth
  from: Mock<(table: TableName) => MockQueryBuilder>
  channel: Mock<(name: string) => MockRealtimeChannel>
  rpc: Mock<(fn: string, params?: object) => Promise<{ data: unknown; error: MockPostgrestError | null }>>
  storage: {
    from: Mock<(bucket: string) => MockStorageBucket>
  }
}

export interface MockStorageBucket {
  upload: Mock<(path: string, file: File | Blob) => Promise<{ data: { path: string }; error: Error | null }>>
  download: Mock<(path: string) => Promise<{ data: Blob | null; error: Error | null }>>
  remove: Mock<(paths: string[]) => Promise<{ data: unknown; error: Error | null }>>
  getPublicUrl: Mock<(path: string) => { data: { publicUrl: string } }>
  list: Mock<(path?: string) => Promise<{ data: Array<{ name: string }>; error: Error | null }>>
}

// ============================================================================
// Mock Data Storage (for stateful mocks)
// ============================================================================

const mockDataStore = new Map<string, unknown[]>()

export function setMockData<T extends TableName>(
  table: T,
  data: Database['public']['Tables'][T]['Row'][]
): void {
  mockDataStore.set(table, data)
}

export function getMockData<T extends TableName>(
  table: T
): Database['public']['Tables'][T]['Row'][] {
  return (mockDataStore.get(table) as Database['public']['Tables'][T]['Row'][]) || []
}

export function clearMockData(): void {
  mockDataStore.clear()
}

// ============================================================================
// Query Builder Factory
// ============================================================================

export function createMockQueryBuilder<T = unknown>(defaultData: T[] = []): MockQueryBuilder<T> {
  let result: T[] = [...defaultData]
  let pendingError: MockPostgrestError | null = null

  const builder: MockQueryBuilder<T> = {
    select: vi.fn().mockImplementation(() => builder),
    insert: vi.fn().mockImplementation((values: T | T[]) => {
      const toInsert = Array.isArray(values) ? values : [values]
      result = [...result, ...toInsert]
      return builder
    }),
    update: vi.fn().mockImplementation(() => builder),
    delete: vi.fn().mockImplementation(() => builder),
    upsert: vi.fn().mockImplementation((values: T | T[]) => {
      const toUpsert = Array.isArray(values) ? values : [values]
      result = [...result, ...toUpsert]
      return builder
    }),
    eq: vi.fn().mockImplementation(() => builder),
    neq: vi.fn().mockImplementation(() => builder),
    gt: vi.fn().mockImplementation(() => builder),
    gte: vi.fn().mockImplementation(() => builder),
    lt: vi.fn().mockImplementation(() => builder),
    lte: vi.fn().mockImplementation(() => builder),
    like: vi.fn().mockImplementation(() => builder),
    ilike: vi.fn().mockImplementation(() => builder),
    is: vi.fn().mockImplementation(() => builder),
    in: vi.fn().mockImplementation(() => builder),
    contains: vi.fn().mockImplementation(() => builder),
    containedBy: vi.fn().mockImplementation(() => builder),
    order: vi.fn().mockImplementation(() => builder),
    limit: vi.fn().mockImplementation((count: number) => {
      result = result.slice(0, count)
      return builder
    }),
    range: vi.fn().mockImplementation((from: number, to: number) => {
      result = result.slice(from, to + 1)
      return builder
    }),
    single: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: result[0] ?? null,
        error: pendingError,
      })
    ),
    maybeSingle: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: result[0] ?? null,
        error: pendingError,
      })
    ),
    then: (onfulfilled) => {
      const response = {
        data: result.length > 0 ? result : null,
        error: pendingError,
      }
      return Promise.resolve(onfulfilled ? onfulfilled(response as { data: T[] | null; error: MockPostgrestError | null }) : response)
    },
  }

  // Allow setting error for testing error cases
  ;(builder as MockQueryBuilder<T> & { _setError: (err: MockPostgrestError | null) => void })._setError = (err) => {
    pendingError = err
  }

  return builder
}

// ============================================================================
// Auth Mock Factory
// ============================================================================

export function createMockAuth(defaultUser: SupabaseUser | null = null): MockAuth {
  let currentUser = defaultUser
  let currentSession: Session | null = defaultUser
    ? {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: defaultUser,
      }
    : null

  const authStateListeners: Array<(event: string, session: Session | null) => void> = []

  return {
    getUser: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: { user: currentUser },
        error: null,
      })
    ),
    getSession: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: { session: currentSession },
        error: null,
      })
    ),
    signUp: vi.fn().mockImplementation(({ email }) => {
      const newUser: SupabaseUser = {
        id: crypto.randomUUID(),
        email,
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
      }
      currentUser = newUser
      currentSession = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: newUser,
      }
      authStateListeners.forEach((cb) => cb('SIGNED_IN', currentSession))
      return Promise.resolve({
        data: { user: newUser, session: currentSession },
        error: null,
      })
    }),
    signInWithPassword: vi.fn().mockImplementation(({ email }) => {
      if (currentUser?.email === email || !currentUser) {
        const user: SupabaseUser = currentUser || {
          id: crypto.randomUUID(),
          email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
        }
        currentUser = user
        currentSession = {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user,
        }
        authStateListeners.forEach((cb) => cb('SIGNED_IN', currentSession))
        return Promise.resolve({
          data: { user, session: currentSession },
          error: null,
        })
      }
      return Promise.resolve({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', status: 400 } as AuthError,
      })
    }),
    signInWithOAuth: vi.fn().mockImplementation(({ provider }) =>
      Promise.resolve({
        data: { url: `https://supabase.co/auth/v1/authorize?provider=${provider}` },
        error: null,
      })
    ),
    signOut: vi.fn().mockImplementation(() => {
      currentUser = null
      currentSession = null
      authStateListeners.forEach((cb) => cb('SIGNED_OUT', null))
      return Promise.resolve({ error: null })
    }),
    resetPasswordForEmail: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: {}, error: null })
    ),
    updateUser: vi.fn().mockImplementation((attributes) => {
      if (currentUser) {
        currentUser = { ...currentUser, ...attributes }
      }
      return Promise.resolve({
        data: { user: currentUser },
        error: null,
      })
    }),
    onAuthStateChange: vi.fn().mockImplementation((callback) => {
      authStateListeners.push(callback)
      // Immediately call with current state
      callback(currentSession ? 'INITIAL_SESSION' : 'SIGNED_OUT', currentSession)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const index = authStateListeners.indexOf(callback)
              if (index > -1) authStateListeners.splice(index, 1)
            },
          },
        },
      }
    }),
  }
}

// ============================================================================
// Realtime Mock Factory
// ============================================================================

export function createMockRealtimeChannel(): MockRealtimeChannel {
  const listeners: Array<{ event: string; callback: (payload: unknown) => void }> = []

  const channel: MockRealtimeChannel = {
    on: vi.fn().mockImplementation((event: string, _filter: object, callback: (payload: unknown) => void) => {
      listeners.push({ event, callback })
      return channel
    }),
    subscribe: vi.fn().mockImplementation((callback) => {
      if (callback) callback('SUBSCRIBED')
      return channel
    }),
    unsubscribe: vi.fn(),
  }

  // Helper to simulate events
  ;(channel as MockRealtimeChannel & { _emit: (event: string, payload: unknown) => void })._emit = (
    event: string,
    payload: unknown
  ) => {
    listeners
      .filter((l) => l.event === event || l.event === '*')
      .forEach((l) => l.callback(payload))
  }

  return channel
}

// ============================================================================
// Storage Mock Factory
// ============================================================================

export function createMockStorageBucket(): MockStorageBucket {
  const files = new Map<string, Blob>()

  return {
    upload: vi.fn().mockImplementation((path: string, file: Blob) => {
      files.set(path, file)
      return Promise.resolve({ data: { path }, error: null })
    }),
    download: vi.fn().mockImplementation((path: string) => {
      const file = files.get(path)
      return Promise.resolve({ data: file || null, error: file ? null : new Error('File not found') })
    }),
    remove: vi.fn().mockImplementation((paths: string[]) => {
      paths.forEach((p) => files.delete(p))
      return Promise.resolve({ data: {}, error: null })
    }),
    getPublicUrl: vi.fn().mockImplementation((path: string) => ({
      data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/bucket/${path}` },
    })),
    list: vi.fn().mockImplementation((prefix = '') => {
      const matchingFiles = Array.from(files.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }))
      return Promise.resolve({ data: matchingFiles, error: null })
    }),
  }
}

// ============================================================================
// Full Client Mock Factory
// ============================================================================

export function createMockSupabaseClient(options?: {
  user?: SupabaseUser | null
  data?: Partial<Record<TableName, unknown[]>>
}): MockSupabaseClient {
  const auth = createMockAuth(options?.user)
  const channels = new Map<string, MockRealtimeChannel>()
  const storageBuckets = new Map<string, MockStorageBucket>()

  // Initialize mock data
  if (options?.data) {
    Object.entries(options.data).forEach(([table, data]) => {
      setMockData(table as TableName, data as Database['public']['Tables'][TableName]['Row'][])
    })
  }

  return {
    auth,
    from: vi.fn().mockImplementation((table: TableName) => {
      const data = getMockData(table)
      return createMockQueryBuilder(data)
    }),
    channel: vi.fn().mockImplementation((name: string) => {
      if (!channels.has(name)) {
        channels.set(name, createMockRealtimeChannel())
      }
      return channels.get(name)!
    }),
    rpc: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    ),
    storage: {
      from: vi.fn().mockImplementation((bucket: string) => {
        if (!storageBuckets.has(bucket)) {
          storageBuckets.set(bucket, createMockStorageBucket())
        }
        return storageBuckets.get(bucket)!
      }),
    },
  }
}

// ============================================================================
// Helper Functions for Test Setup
// ============================================================================

/**
 * Configure mock to return specific data for a query
 */
export function mockQueryResponse<T>(
  client: MockSupabaseClient,
  table: TableName,
  data: T[]
): void {
  const builder = createMockQueryBuilder(data)
  client.from.mockImplementation((t: TableName) => {
    if (t === table) return builder
    return createMockQueryBuilder(getMockData(t))
  })
}

/**
 * Configure mock to return an error for a query
 */
export function mockQueryError(
  client: MockSupabaseClient,
  table: TableName,
  error: MockPostgrestError
): void {
  const builder = createMockQueryBuilder([])
  ;(builder as MockQueryBuilder & { _setError: (err: MockPostgrestError | null) => void })._setError(error)
  client.from.mockImplementation((t: TableName) => {
    if (t === table) return builder
    return createMockQueryBuilder(getMockData(t))
  })
}

/**
 * Configure mock auth to simulate logged in user
 */
export function mockLoggedInUser(
  client: MockSupabaseClient,
  user: SupabaseUser
): void {
  client.auth.getUser.mockResolvedValue({
    data: { user },
    error: null,
  })
  client.auth.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user,
      },
    },
    error: null,
  })
}

/**
 * Configure mock auth to simulate logged out state
 */
export function mockLoggedOutUser(client: MockSupabaseClient): void {
  client.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: null,
  })
  client.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  })
}

/**
 * Configure mock auth to return an error
 */
export function mockAuthError(
  client: MockSupabaseClient,
  error: AuthError
): void {
  client.auth.getUser.mockResolvedValue({
    data: { user: null },
    error,
  })
  client.auth.getSession.mockResolvedValue({
    data: { session: null },
    error,
  })
}

// ============================================================================
// Default Export
// ============================================================================

export default createMockSupabaseClient
