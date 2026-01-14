export type BounceType = 'hard' | 'soft' | 'complaint' | 'unsubscribe'

export interface BounceEvent {
  email: string
  type: BounceType
  reason: string
  timestamp: Date
}

export function classifyBounce(errorMessage: string): { type: BounceType; reason: string } {
  const lower = errorMessage.toLowerCase()

  if (lower.includes('does not exist') || lower.includes('user unknown') || lower.includes('no such user')) {
    return { type: 'hard', reason: 'Email address does not exist' }
  }
  if (lower.includes('mailbox full') || lower.includes('quota exceeded')) {
    return { type: 'soft', reason: 'Mailbox full' }
  }
  if (lower.includes('spam') || lower.includes('blocked')) {
    return { type: 'hard', reason: 'Blocked as spam' }
  }
  if (lower.includes('temporarily') || lower.includes('try again')) {
    return { type: 'soft', reason: 'Temporary failure' }
  }

  return { type: 'soft', reason: 'Unknown error' }
}

export async function processBouncesForLead(_leadId: string, _bounceType: BounceType): Promise<void> {
  // Mark lead based on bounce type
  // Hard bounce = remove from list
  // Soft bounce = retry later
  // TODO: Implement lead status update based on bounce type
}
