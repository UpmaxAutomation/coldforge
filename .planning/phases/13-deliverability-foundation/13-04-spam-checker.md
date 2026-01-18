# Plan 13-04: Content Spam Checker

## Objective
Build a real-time spam analysis system that scores email content and provides actionable improvements before sending.

## Why This Matters
Gmail's RETVec detects spammy patterns. Checking content BEFORE sending prevents reputation damage.

## Tasks

### Task 1: Spam Word Database

Create `/src/lib/spam-checker/spam-words.ts`:

```typescript
export const SPAM_TRIGGERS = {
  // High risk (deduct 15 points each)
  critical: [
    'free', 'guarantee', 'winner', 'congratulations', 'act now',
    'limited time', 'urgent', 'immediate', 'expire', 'offer expires',
    'click here', 'click below', 'buy now', 'order now', 'sign up free',
    'no obligation', 'no cost', 'risk free', 'no strings attached',
    'double your', 'earn extra', 'make money', 'extra income',
    'credit card required', 'no credit check', 'earn $', 'make $'
  ],

  // Medium risk (deduct 8 points each)
  warning: [
    'discount', 'deal', 'save', 'cheap', 'lowest price', 'best price',
    'special promotion', 'exclusive offer', 'limited offer', 'one time',
    'subscribe', 'unsubscribe', 'remove', 'opt-out', 'opt out',
    'click', 'download', 'access', 'claim', 'collect', 'get it now',
    'bonus', 'gift', 'prize', 'reward', 'cash', 'money back',
    'increase', 'lose weight', 'weight loss', 'diet'
  ],

  // Low risk (deduct 3 points each)
  caution: [
    'opportunity', 'amazing', 'incredible', 'fantastic', 'wonderful',
    'solution', 'breakthrough', 'revolutionary', 'exclusive', 'secret',
    'proven', 'tested', 'results', 'success', 'performance',
    'lowest', 'highest', 'best', 'top', 'number one', '#1',
    'million', 'billion', 'thousand', 'percent'
  ]
};

export const SPAM_PATTERNS = {
  // Regex patterns with their penalties
  allCaps: { pattern: /\b[A-Z]{4,}\b/g, penalty: 5, description: 'ALL CAPS words' },
  excessiveExclamation: { pattern: /!{2,}/g, penalty: 10, description: 'Multiple exclamation marks' },
  excessiveQuestion: { pattern: /\?{2,}/g, penalty: 5, description: 'Multiple question marks' },
  dollarAmount: { pattern: /\$\d+/g, penalty: 3, description: 'Dollar amounts' },
  percentOff: { pattern: /\d+%\s*off/gi, penalty: 8, description: 'Percentage discounts' },
  multipleLinks: { pattern: /https?:\/\//g, penalty: 10, description: 'Multiple links' },
  shortUrl: { pattern: /bit\.ly|goo\.gl|tinyurl|t\.co/gi, penalty: 15, description: 'URL shorteners' },
  htmlInText: { pattern: /<[^>]+>/g, penalty: 5, description: 'HTML tags' }
};

export interface SpamCheckResult {
  score: number;          // 0-100 (higher = better)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SpamIssue[];
  suggestions: string[];
  wordCount: number;
  linkCount: number;
  readableInSeconds: number;
}

export interface SpamIssue {
  type: 'critical' | 'warning' | 'caution' | 'pattern';
  text: string;
  penalty: number;
  suggestion: string;
  position?: { start: number; end: number };
}
```

### Task 2: Spam Analyzer

Create `/src/lib/spam-checker/analyzer.ts`:

```typescript
import { SPAM_TRIGGERS, SPAM_PATTERNS, SpamCheckResult, SpamIssue } from './spam-words';

/**
 * Analyze email content for spam triggers
 */
export function analyzeContent(subject: string, body: string): SpamCheckResult {
  const fullText = `${subject} ${body}`.toLowerCase();
  const issues: SpamIssue[] = [];
  let penalty = 0;

  // Check spam trigger words
  for (const word of SPAM_TRIGGERS.critical) {
    if (fullText.includes(word.toLowerCase())) {
      penalty += 15;
      issues.push({
        type: 'critical',
        text: word,
        penalty: 15,
        suggestion: `Remove or rephrase "${word}" - high spam risk`
      });
    }
  }

  for (const word of SPAM_TRIGGERS.warning) {
    if (fullText.includes(word.toLowerCase())) {
      penalty += 8;
      issues.push({
        type: 'warning',
        text: word,
        penalty: 8,
        suggestion: `Consider removing "${word}"`
      });
    }
  }

  for (const word of SPAM_TRIGGERS.caution) {
    if (fullText.includes(word.toLowerCase())) {
      penalty += 3;
      issues.push({
        type: 'caution',
        text: word,
        penalty: 3,
        suggestion: `"${word}" may trigger spam filters if overused`
      });
    }
  }

  // Check patterns
  for (const [name, config] of Object.entries(SPAM_PATTERNS)) {
    const matches = fullText.match(config.pattern);
    if (matches) {
      const count = matches.length;
      const totalPenalty = config.penalty * count;
      penalty += totalPenalty;
      issues.push({
        type: 'pattern',
        text: `${count}x ${config.description}`,
        penalty: totalPenalty,
        suggestion: `Reduce ${config.description.toLowerCase()}`
      });
    }
  }

  // Check content structure
  const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
  const linkCount = (body.match(/https?:\/\//g) || []).length;

  // Penalize too long or too short
  if (wordCount > 300) {
    penalty += 15;
    issues.push({
      type: 'warning',
      text: `${wordCount} words`,
      penalty: 15,
      suggestion: 'Keep cold emails under 150 words for best results'
    });
  } else if (wordCount < 20) {
    penalty += 10;
    issues.push({
      type: 'warning',
      text: 'Too short',
      penalty: 10,
      suggestion: 'Add more context - very short emails look suspicious'
    });
  }

  // Penalize multiple links
  if (linkCount > 1) {
    penalty += (linkCount - 1) * 15;
    issues.push({
      type: 'critical',
      text: `${linkCount} links`,
      penalty: (linkCount - 1) * 15,
      suggestion: 'Use only 1 link maximum, preferably none in first email'
    });
  }

  // Check subject line
  if (subject.length > 60) {
    penalty += 5;
    issues.push({
      type: 'caution',
      text: 'Long subject line',
      penalty: 5,
      suggestion: 'Keep subject under 50 characters'
    });
  }

  if (subject === subject.toUpperCase() && subject.length > 5) {
    penalty += 15;
    issues.push({
      type: 'critical',
      text: 'ALL CAPS subject',
      penalty: 15,
      suggestion: 'Use sentence case in subject line'
    });
  }

  // Calculate final score
  const score = Math.max(0, Math.min(100, 100 - penalty));

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  // Generate suggestions
  const suggestions = generateSuggestions(issues, score);

  return {
    score,
    grade,
    issues: issues.sort((a, b) => b.penalty - a.penalty),
    suggestions,
    wordCount,
    linkCount,
    readableInSeconds: Math.ceil(wordCount / 3.5) // Average reading speed
  };
}

function generateSuggestions(issues: SpamIssue[], score: number): string[] {
  const suggestions: string[] = [];

  const critical = issues.filter(i => i.type === 'critical');
  const warnings = issues.filter(i => i.type === 'warning');

  if (critical.length > 0) {
    suggestions.push(`Remove ${critical.length} critical spam trigger(s) first`);
  }

  if (warnings.length > 3) {
    suggestions.push('Rewrite with simpler, more conversational language');
  }

  if (score < 70) {
    suggestions.push('Consider using AI Email Writer for better deliverability');
  }

  if (score >= 80 && score < 90) {
    suggestions.push('Good! Minor improvements could boost inbox placement');
  }

  if (score >= 90) {
    suggestions.push('Excellent! This email should have good deliverability');
  }

  return suggestions;
}

/**
 * Quick check - returns just the score
 */
export function quickCheck(content: string): number {
  const result = analyzeContent('', content);
  return result.score;
}

/**
 * Check if content passes minimum threshold
 */
export function passesThreshold(subject: string, body: string, minScore: number = 70): boolean {
  const result = analyzeContent(subject, body);
  return result.score >= minScore;
}
```

### Task 3: Spam Checker API

Create `/src/app/api/spam-check/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeContent } from '@/lib/spam-checker/analyzer';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subject, content } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    const result = analyzeContent(subject || '', content);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Spam check error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
```

### Task 4: Spam Score UI Component

Create `/src/components/campaigns/spam-score.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface SpamScoreProps {
  subject: string;
  content: string;
}

interface SpamResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: Array<{
    type: string;
    text: string;
    penalty: number;
    suggestion: string;
  }>;
  suggestions: string[];
  wordCount: number;
  linkCount: number;
}

export function SpamScore({ subject, content }: SpamScoreProps) {
  const [result, setResult] = useState<SpamResult | null>(null);
  const [loading, setLoading] = useState(false);

  const debouncedSubject = useDebounce(subject, 500);
  const debouncedContent = useDebounce(content, 500);

  useEffect(() => {
    if (!debouncedContent) {
      setResult(null);
      return;
    }

    const analyze = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/spam-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: debouncedSubject, content: debouncedContent })
        });

        if (response.ok) {
          const data = await response.json();
          setResult(data);
        }
      } catch (error) {
        console.error('Spam check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    analyze();
  }, [debouncedSubject, debouncedContent]);

  if (!result) return null;

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500';
      case 'B': return 'bg-green-400';
      case 'C': return 'bg-yellow-500';
      case 'D': return 'bg-orange-500';
      case 'F': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 80) return 'text-green-400';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  const criticalIssues = result.issues.filter(i => i.type === 'critical');
  const warningIssues = result.issues.filter(i => i.type === 'warning');

  return (
    <Card className="border-l-4" style={{ borderLeftColor: result.score >= 80 ? '#22c55e' : result.score >= 60 ? '#f59e0b' : '#ef4444' }}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Spam Score</span>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${getScoreColor(result.score)}`}>
              {result.score}
            </span>
            <Badge className={`${getGradeColor(result.grade)} text-white`}>
              {result.grade}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-3 space-y-4">
        <Progress value={result.score} className="h-2" />

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{result.wordCount} words</span>
          <span>{result.linkCount} link(s)</span>
        </div>

        {criticalIssues.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
              <XCircle className="h-4 w-4" />
              Critical Issues ({criticalIssues.length})
            </div>
            {criticalIssues.map((issue, i) => (
              <div key={i} className="text-sm p-2 bg-red-50 dark:bg-red-950 rounded">
                <span className="font-medium">{issue.text}</span>
                <span className="text-muted-foreground"> - {issue.suggestion}</span>
              </div>
            ))}
          </div>
        )}

        {warningIssues.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-yellow-500 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Warnings ({warningIssues.length})
            </div>
            {warningIssues.slice(0, 3).map((issue, i) => (
              <div key={i} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                <span className="font-medium">{issue.text}</span>
                <span className="text-muted-foreground"> - {issue.suggestion}</span>
              </div>
            ))}
            {warningIssues.length > 3 && (
              <div className="text-sm text-muted-foreground">
                +{warningIssues.length - 3} more warnings
              </div>
            )}
          </div>
        )}

        {result.score >= 80 && (
          <div className="flex items-center gap-2 text-green-500 text-sm">
            <CheckCircle className="h-4 w-4" />
            Good deliverability expected
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div className="space-y-1">
            {result.suggestions.map((suggestion, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5" />
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Task 5: Index Export

Create `/src/lib/spam-checker/index.ts`:

```typescript
export * from './spam-words';
export * from './analyzer';
```

## Verification

- [ ] Detects "free" as critical spam trigger
- [ ] Penalizes ALL CAPS subject lines
- [ ] Penalizes multiple links
- [ ] Returns score 0-100
- [ ] Real-time analysis in UI
- [ ] Grade A/B/C/D/F displayed
- [ ] Suggestions are actionable

## Done When

- Spam word database complete
- Real-time analysis working
- UI component shows live score
- Pre-send validation gate in campaign builder
- All tests pass
