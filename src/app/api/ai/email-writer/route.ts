import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateColdEmail,
  generateEmailVariations,
  improveEmail,
  EmailGenerationRequest
} from '@/lib/ai/claude-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action = 'generate' } = body;

    switch (action) {
      case 'generate': {
        const {
          companyName,
          recipientRole,
          recipientIndustry,
          valueProposition,
          tone = 'professional',
          callToAction,
          senderName,
          senderCompany,
          additionalContext,
          generateMultiple = false,
          variationCount = 5
        } = body;

        // Validate required fields
        if (!companyName || !valueProposition || !callToAction || !senderName || !senderCompany) {
          return NextResponse.json(
            { error: 'Missing required fields: companyName, valueProposition, callToAction, senderName, senderCompany' },
            { status: 400 }
          );
        }

        const emailRequest: EmailGenerationRequest = {
          companyName,
          recipientRole,
          recipientIndustry,
          valueProposition,
          tone,
          callToAction,
          senderName,
          senderCompany,
          additionalContext
        };

        if (generateMultiple) {
          const result = await generateEmailVariations(emailRequest, variationCount);
          return NextResponse.json(result);
        } else {
          const email = await generateColdEmail(emailRequest);
          return NextResponse.json({ email });
        }
      }

      case 'improve': {
        const { subject, body: emailBody } = body;

        if (!subject || !emailBody) {
          return NextResponse.json(
            { error: 'Missing required fields: subject, body' },
            { status: 400 }
          );
        }

        const improved = await improveEmail(subject, emailBody);
        return NextResponse.json({ email: improved });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('AI email writer error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    );
  }
}
