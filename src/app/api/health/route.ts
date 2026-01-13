import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Track server start time for uptime calculation
const serverStartTime = Date.now()

type CheckStatus = 'pass' | 'fail'

interface HealthCheck {
  name: string
  status: CheckStatus
  responseTime?: number
  error?: string
}

type OverallStatus = 'healthy' | 'degraded' | 'unhealthy'

interface HealthResponse {
  status: OverallStatus
  timestamp: string
  version: string
  uptime: number
  checks: HealthCheck[]
}

async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)

    const responseTime = Date.now() - startTime

    if (error) {
      return {
        name: 'database',
        status: 'fail',
        responseTime,
        error: error.message,
      }
    }

    return {
      name: 'database',
      status: 'pass',
      responseTime,
    }
  } catch (err) {
    return {
      name: 'database',
      status: 'fail',
      responseTime: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Unknown database error',
    }
  }
}

async function checkAuth(): Promise<HealthCheck> {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getSession()

    const responseTime = Date.now() - startTime

    if (error) {
      return {
        name: 'auth',
        status: 'fail',
        responseTime,
        error: error.message,
      }
    }

    return {
      name: 'auth',
      status: 'pass',
      responseTime,
    }
  } catch (err) {
    return {
      name: 'auth',
      status: 'fail',
      responseTime: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Unknown auth error',
    }
  }
}

function checkEnvironment(): HealthCheck {
  const startTime = Date.now()

  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  )

  const responseTime = Date.now() - startTime

  if (missingVars.length > 0) {
    return {
      name: 'environment',
      status: 'fail',
      responseTime,
      error: `Missing environment variables: ${missingVars.join(', ')}`,
    }
  }

  return {
    name: 'environment',
    status: 'pass',
    responseTime,
  }
}

function calculateOverallStatus(checks: HealthCheck[]): OverallStatus {
  const failedChecks = checks.filter((check) => check.status === 'fail')

  if (failedChecks.length === 0) {
    return 'healthy'
  }

  // If environment or database fails, system is unhealthy
  const criticalFailures = failedChecks.filter(
    (check) => check.name === 'database' || check.name === 'environment'
  )

  if (criticalFailures.length > 0) {
    return 'unhealthy'
  }

  // Non-critical failures result in degraded status
  return 'degraded'
}

export async function GET() {
  const checks: HealthCheck[] = []

  // Run all health checks
  const [dbCheck, authCheck] = await Promise.all([
    checkDatabase(),
    checkAuth(),
  ])

  checks.push(checkEnvironment())
  checks.push(dbCheck)
  checks.push(authCheck)

  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000)

  const response: HealthResponse = {
    status: calculateOverallStatus(checks),
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: uptimeSeconds,
    checks,
  }

  // Return appropriate HTTP status code based on health
  const httpStatus = response.status === 'healthy' ? 200 :
                     response.status === 'degraded' ? 200 : 503

  return NextResponse.json(response, { status: httpStatus })
}
