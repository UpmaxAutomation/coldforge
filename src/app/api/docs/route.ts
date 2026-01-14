import { NextResponse } from 'next/server'
import { openApiSpec } from '@/lib/docs/openapi'

export async function GET() {
  return NextResponse.json(openApiSpec)
}
