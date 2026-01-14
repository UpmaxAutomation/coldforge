import { NextRequest, NextResponse } from 'next/server'
import { classifyBounce, processBouncesForLead, BounceEvent } from '@/lib/deliverability/bounce-handler'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { email, errorMessage, leadId } = body

    if (!email || !errorMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: email, errorMessage' },
        { status: 400 }
      )
    }

    const classification = classifyBounce(errorMessage)

    const bounceEvent: BounceEvent = {
      email,
      type: classification.type,
      reason: classification.reason,
      timestamp: new Date()
    }

    if (leadId) {
      await processBouncesForLead(leadId, classification.type)
    }

    return NextResponse.json({
      success: true,
      bounce: bounceEvent
    })
  } catch (error) {
    console.error('Bounce webhook error:', error)
    return NextResponse.json(
      { error: 'Failed to process bounce' },
      { status: 500 }
    )
  }
}
