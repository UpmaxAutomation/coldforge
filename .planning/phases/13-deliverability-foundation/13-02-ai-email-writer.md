# Plan 13-02: AI Email Writer (Claude Integration)

## Objective
Build an AI-powered email writer using Claude that generates unique, human-sounding cold emails with built-in spintax variations and spam-aware writing.

## Why This Matters
- Gmail's RETVec ML model detects templated/AI-generated patterns
- Human-sounding, personalized emails are essential for deliverability
- AI writer with proper prompting can generate variations that pass spam filters

## Tasks

### Task 1: Claude API Client

Create `/src/lib/ai/claude-client.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface EmailGenerationRequest {
  companyName: string;
  recipientRole?: string;
  recipientIndustry?: string;
  valueProposition: string;
  tone: 'professional' | 'casual' | 'friendly' | 'direct';
  callToAction: string;
  senderName: string;
  senderCompany: string;
  additionalContext?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  spintaxSubject: string;
  spintaxBody: string;
  variationCount: number;
  spamScore: number;
  tips: string[];
}

export interface EmailVariationSet {
  emails: GeneratedEmail[];
  metadata: {
    totalVariations: number;
    avgSpamScore: number;
    generatedAt: string;
  };
}

const EMAIL_WRITER_PROMPT = `You are an expert cold email copywriter who specializes in emails that land in the PRIMARY inbox, not spam or promotions.

CRITICAL RULES FOR DELIVERABILITY:
1. NO spam trigger words: "free", "guarantee", "limited time", "act now", "click here", "buy now", "discount", "offer", "deal"
2. NO excessive punctuation: !!!, ???, or ALL CAPS
3. NO more than ONE link per email (ideally zero in first email)
4. Keep subject lines under 50 characters, lowercase preferred
5. Write like a real human - include natural imperfections
6. Short paragraphs (2-3 sentences max)
7. Total email length: 50-125 words ideal
8. Include SPINTAX variations using {option1|option2|option3} syntax
9. Each variation should feel like a different email, not just word swaps

PERSONALIZATION HOOKS (use these variables):
{{first_name}} - recipient's first name
{{company}} - recipient's company
{{industry}} - their industry

OUTPUT FORMAT:
Return a JSON object with these fields:
- subject: The email subject line
- body: The email body with spintax
- spintaxSubject: Subject with spintax variations
- tips: Array of 2-3 tips for this specific email`;

export async function generateColdEmail(
  request: EmailGenerationRequest
): Promise<GeneratedEmail> {
  const userPrompt = `Generate a cold email with these specifications:

RECIPIENT:
- Company: ${request.companyName}
- Role: ${request.recipientRole || 'Decision maker'}
- Industry: ${request.recipientIndustry || 'Not specified'}

SENDER:
- Name: ${request.senderName}
- Company: ${request.senderCompany}

VALUE PROPOSITION:
${request.valueProposition}

DESIRED CALL TO ACTION:
${request.callToAction}

TONE: ${request.tone}

${request.additionalContext ? `ADDITIONAL CONTEXT:\n${request.additionalContext}` : ''}

Generate an email that:
1. Opens with a personalized observation (not "I hope this finds you well")
2. Quickly states the value (within first 2 sentences)
3. Includes social proof if natural
4. Ends with a soft CTA (question, not demand)
5. Has spintax for at least 50+ unique variations

Return valid JSON only.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: EMAIL_WRITER_PROMPT + '\n\n' + userPrompt
      }
    ]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  // Parse JSON from response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse email JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Calculate variation count from spintax
  const variationCount = countSpintaxVariations(parsed.spintaxBody || parsed.body);

  // Calculate spam score
  const spamScore = calculateSpamScore(parsed.body);

  return {
    subject: parsed.subject,
    body: parsed.body,
    spintaxSubject: parsed.spintaxSubject || parsed.subject,
    spintaxBody: parsed.spintaxBody || parsed.body,
    variationCount,
    spamScore,
    tips: parsed.tips || []
  };
}

export async function generateEmailVariations(
  request: EmailGenerationRequest,
  count: number = 5
): Promise<EmailVariationSet> {
  const emails: GeneratedEmail[] = [];

  // Generate multiple unique emails
  for (let i = 0; i < count; i++) {
    const email = await generateColdEmail({
      ...request,
      additionalContext: `${request.additionalContext || ''}\n\nThis is variation ${i + 1} of ${count}. Make it distinctly different from typical cold emails. ${i > 0 ? 'Use a completely different opening angle.' : ''}`
    });
    emails.push(email);
  }

  const totalVariations = emails.reduce((sum, e) => sum + e.variationCount, 0);
  const avgSpamScore = emails.reduce((sum, e) => sum + e.spamScore, 0) / emails.length;

  return {
    emails,
    metadata: {
      totalVariations,
      avgSpamScore,
      generatedAt: new Date().toISOString()
    }
  };
}

function countSpintaxVariations(text: string): number {
  const matches = text.match(/\{[^}]+\}/g) || [];
  let count = 1;

  for (const match of matches) {
    const options = match.slice(1, -1).split('|');
    count *= options.length;
  }

  return count;
}

function calculateSpamScore(text: string): number {
  let score = 100;

  const spamTriggers = [
    'free', 'guarantee', 'limited', 'act now', 'click here',
    'buy now', 'discount', 'offer', 'deal', 'winner', 'congratulations',
    'urgent', 'immediate', 'exclusive', 'once in a lifetime'
  ];

  const lowerText = text.toLowerCase();

  for (const trigger of spamTriggers) {
    if (lowerText.includes(trigger)) {
      score -= 10;
    }
  }

  // Check for excessive punctuation
  if ((text.match(/!/g) || []).length > 2) score -= 15;
  if ((text.match(/\?/g) || []).length > 3) score -= 10;

  // Check for ALL CAPS words
  const capsWords = text.match(/\b[A-Z]{4,}\b/g) || [];
  score -= capsWords.length * 5;

  // Check length (penalize too long)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 200) score -= 20;
  if (wordCount > 300) score -= 20;

  // Check for multiple links
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 1) score -= 15 * (linkCount - 1);

  return Math.max(0, Math.min(100, score));
}
```

### Task 2: AI Writer API Endpoint

Create `/src/app/api/ai/email-writer/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateColdEmail, generateEmailVariations, EmailGenerationRequest } from '@/lib/ai/claude-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
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
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const request_: EmailGenerationRequest = {
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
      const result = await generateEmailVariations(request_, variationCount);
      return NextResponse.json(result);
    } else {
      const email = await generateColdEmail(request_);
      return NextResponse.json({ email });
    }

  } catch (error) {
    console.error('AI email writer error:', error);
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    );
  }
}
```

### Task 3: AI Writer UI Component

Create `/src/components/campaigns/ai-email-writer.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface GeneratedEmail {
  subject: string;
  body: string;
  spintaxSubject: string;
  spintaxBody: string;
  variationCount: number;
  spamScore: number;
  tips: string[];
}

interface AIEmailWriterProps {
  onSelect: (subject: string, body: string) => void;
  senderName?: string;
  senderCompany?: string;
}

export function AIEmailWriter({ onSelect, senderName = '', senderCompany = '' }: AIEmailWriterProps) {
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState<GeneratedEmail[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const [form, setForm] = useState({
    companyName: '',
    recipientRole: '',
    recipientIndustry: '',
    valueProposition: '',
    tone: 'professional',
    callToAction: '',
    senderName,
    senderCompany,
    additionalContext: ''
  });

  const handleGenerate = async () => {
    if (!form.companyName || !form.valueProposition || !form.callToAction) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai/email-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          generateMultiple: true,
          variationCount: 5
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate');
      }

      const data = await response.json();
      setEmails(data.emails);
      toast.success(`Generated ${data.emails.length} email variations`);

    } catch (error) {
      toast.error('Failed to generate emails');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (email: GeneratedEmail, index: number) => {
    await navigator.clipboard.writeText(`Subject: ${email.spintaxSubject}\n\n${email.spintaxBody}`);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleUse = (email: GeneratedEmail) => {
    onSelect(email.spintaxSubject, email.spintaxBody);
    toast.success('Email copied to editor');
  };

  const getSpamScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Email Writer
          </CardTitle>
          <CardDescription>
            Generate unique, deliverability-optimized cold emails with Claude AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Target Company *</Label>
              <Input
                value={form.companyName}
                onChange={e => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g., Acme Corp"
              />
            </div>
            <div>
              <Label>Recipient Role</Label>
              <Input
                value={form.recipientRole}
                onChange={e => setForm({ ...form, recipientRole: e.target.value })}
                placeholder="e.g., Marketing Director"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Industry</Label>
              <Input
                value={form.recipientIndustry}
                onChange={e => setForm({ ...form, recipientIndustry: e.target.value })}
                placeholder="e.g., SaaS, E-commerce"
              />
            </div>
            <div>
              <Label>Tone</Label>
              <Select value={form.tone} onValueChange={v => setForm({ ...form, tone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Value Proposition *</Label>
            <Textarea
              value={form.valueProposition}
              onChange={e => setForm({ ...form, valueProposition: e.target.value })}
              placeholder="What value do you offer? What problem do you solve?"
              rows={3}
            />
          </div>

          <div>
            <Label>Call to Action *</Label>
            <Input
              value={form.callToAction}
              onChange={e => setForm({ ...form, callToAction: e.target.value })}
              placeholder="e.g., Book a 15-min call, Reply with interest"
            />
          </div>

          <div>
            <Label>Additional Context</Label>
            <Textarea
              value={form.additionalContext}
              onChange={e => setForm({ ...form, additionalContext: e.target.value })}
              placeholder="Any specific angles, case studies, or things to mention..."
              rows={2}
            />
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating 5 Variations...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Emails
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {emails.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Generated Emails</h3>

          <Tabs defaultValue="0">
            <TabsList className="w-full justify-start">
              {emails.map((email, i) => (
                <TabsTrigger key={i} value={String(i)}>
                  Version {i + 1}
                  <Badge
                    variant="secondary"
                    className={`ml-2 ${getSpamScoreColor(email.spamScore)} text-white`}
                  >
                    {email.spamScore}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {emails.map((email, i) => (
              <TabsContent key={i} value={String(i)}>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {email.variationCount.toLocaleString()} variations
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`${getSpamScoreColor(email.spamScore)} text-white`}
                        >
                          Spam Score: {email.spamScore}/100
                        </Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(email, i)}
                        >
                          {copied === i ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button size="sm" onClick={() => handleUse(email)}>
                          Use This Email
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Subject</Label>
                      <p className="font-medium">{email.spintaxSubject}</p>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Body (with Spintax)</Label>
                      <div className="p-3 bg-muted rounded-md whitespace-pre-wrap text-sm font-mono">
                        {email.spintaxBody}
                      </div>
                    </div>

                    {email.tips.length > 0 && (
                      <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-yellow-800 dark:text-yellow-200">Tips</p>
                          <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-300">
                            {email.tips.map((tip, j) => (
                              <li key={j}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
```

### Task 4: Environment Variable

Add to `.env.example` and `.env.local`:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Task 5: Install Anthropic SDK

```bash
npm install @anthropic-ai/sdk
```

## Verification

- [ ] API returns valid JSON with email content
- [ ] Spintax is properly formatted in output
- [ ] Spam score calculation works
- [ ] UI shows all 5 variations
- [ ] "Use This Email" copies to editor
- [ ] No spam trigger words in output

## Done When

- Claude API integration working
- 5 unique variations generated per request
- Spam score visible for each email
- UI component integrates with campaign builder
- Tests pass
