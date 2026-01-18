import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeContent, passesThreshold, getIssuesBySeverity } from '@/lib/spam-checker';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subject, content, action = 'analyze', minScore = 70 } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    switch (action) {
      case 'analyze': {
        const result = analyzeContent(subject || '', content);
        return NextResponse.json(result);
      }

      case 'check': {
        const passes = passesThreshold(subject || '', content, minScore);
        const result = analyzeContent(subject || '', content);
        return NextResponse.json({
          passes,
          score: result.score,
          grade: result.grade,
          summary: result.summary
        });
      }

      case 'issues': {
        const issues = getIssuesBySeverity(subject || '', content);
        return NextResponse.json(issues);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Spam check error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
