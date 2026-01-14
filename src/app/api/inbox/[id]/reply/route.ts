import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createTransporter, sendEmail, type EmailContent } from '@/lib/sending'

// POST /api/inbox/[id]/reply - Send a reply to a thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get the thread
    const { data: thread } = await supabase
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          mailbox_id: string
          subject: string
          participant_email: string
          participant_name: string | null
        } | null
      }

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const body = await request.json()
    const { message, mailboxId } = body

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get mailbox to send from (use provided or thread's default)
    const sendMailboxId = mailboxId || thread.mailbox_id
    const { data: mailbox } = await supabase
      .from('mailboxes')
      .select('id, email, smtp_host, smtp_port, smtp_user, smtp_pass, first_name, last_name')
      .eq('id', sendMailboxId)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          email: string
          smtp_host: string
          smtp_port: number
          smtp_user: string
          smtp_pass: string
          first_name: string | null
          last_name: string | null
        } | null
      }

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    // Get the latest message to reply to
    const { data: latestMessage } = await supabase
      .from('replies')
      .select('message_id')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: false })
      .limit(1)
      .single() as { data: { message_id: string } | null }

    // Prepare subject
    const subject = thread.subject.match(/^re:/i)
      ? thread.subject
      : `Re: ${thread.subject}`

    // Generate message ID
    const emailDomain = mailbox.email.split('@')[1] ?? 'unknown'
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${emailDomain}>`

    // Create email content
    const fromName = [mailbox.first_name, mailbox.last_name].filter(Boolean).join(' ') || mailbox.email.split('@')[0] || 'Unknown'
    const emailContent: EmailContent = {
      from: {
        email: mailbox.email,
        name: fromName,
      },
      to: {
        email: thread.participant_email,
        name: thread.participant_name || undefined,
      },
      subject,
      html: message,
      text: message.replace(/<[^>]*>/g, ''),
      headers: {
        'Message-ID': messageId,
        ...(latestMessage?.message_id && {
          'In-Reply-To': latestMessage.message_id,
          'References': latestMessage.message_id,
        }),
      },
    }

    // Send the email
    try {
      const transporter = createTransporter({
        host: mailbox.smtp_host,
        port: mailbox.smtp_port,
        secure: mailbox.smtp_port === 465,
        auth: {
          user: mailbox.smtp_user,
          pass: mailbox.smtp_pass,
        },
      })

      const result = await sendEmail(transporter, emailContent)

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email')
      }
    } catch (sendError) {
      console.error('Failed to send reply:', sendError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    // Record the outbound message in thread_messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('thread_messages') as any)
      .insert({
        thread_id: threadId,
        direction: 'outbound',
        message_id: messageId,
        from_email: mailbox.email,
        from_name: fromName,
        to_email: thread.participant_email,
        subject,
        body_text: message.replace(/<[^>]*>/g, ''),
        body_html: message,
        sent_at: new Date().toISOString(),
      })

    // Update thread last message time and increment count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads') as any)
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    // Increment thread message count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('increment_thread_message_count', {
      p_thread_id: threadId,
    })

    // Mark the latest reply as replied (if exists)
    if (latestMessage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('replies') as any)
        .update({ status: 'replied', updated_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('status', 'read')
        .order('received_at', { ascending: false })
        .limit(1)
    }

    return NextResponse.json({
      success: true,
      messageId,
      sentAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Send reply error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
