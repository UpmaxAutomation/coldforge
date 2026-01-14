import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeContent } from '@/lib/deliverability/spam-analyzer'

// POST /api/deliverability/analyze - Analyze email content for spam score
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, content } = body

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: 'Subject is required and must be a string' },
        { status: 400 }
      )
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      )
    }

    const result = analyzeContent(subject, content)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Spam analysis API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
