# Plan 13-01: Spintax Variation Engine

## Objective
Build a spintax parser and variation generator that ensures every email is unique, defeating Gmail's pattern detection.

## Why This Matters
Gmail's ML model (RETVec) detects templated emails. Sending identical content triggers spam classification. Each recipient must receive a unique email.

## Tasks

### Task 1: Spintax Parser Core

Create `/src/lib/spintax/parser.ts`:

```typescript
/**
 * Spintax Parser - Generates unique email variations
 * Syntax: {option1|option2|option3}
 * Nested: {Hi|Hello {friend|colleague}}
 */

export interface SpintaxToken {
  type: 'text' | 'spin';
  value: string;
  options?: SpintaxToken[][];
}

export interface SpintaxResult {
  text: string;
  hash: string;
  variationIndex: number;
}

/**
 * Parse spintax string into tokens
 */
export function parseSpintax(input: string): SpintaxToken[] {
  const tokens: SpintaxToken[] = [];
  let current = 0;

  while (current < input.length) {
    if (input[current] === '{') {
      // Find matching closing brace (handle nesting)
      const closeIndex = findMatchingBrace(input, current);
      if (closeIndex === -1) {
        // No matching brace, treat as text
        tokens.push({ type: 'text', value: '{' });
        current++;
        continue;
      }

      const content = input.slice(current + 1, closeIndex);
      const options = splitOptions(content).map(opt => parseSpintax(opt));

      tokens.push({ type: 'spin', value: content, options });
      current = closeIndex + 1;
    } else {
      // Collect text until next { or end
      let textEnd = current;
      while (textEnd < input.length && input[textEnd] !== '{') {
        textEnd++;
      }

      if (textEnd > current) {
        tokens.push({ type: 'text', value: input.slice(current, textEnd) });
      }
      current = textEnd;
    }
  }

  return tokens;
}

/**
 * Find matching closing brace, handling nested braces
 */
function findMatchingBrace(input: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;

  while (i < input.length && depth > 0) {
    if (input[i] === '{') depth++;
    else if (input[i] === '}') depth--;
    i++;
  }

  return depth === 0 ? i - 1 : -1;
}

/**
 * Split options by | but respect nested braces
 */
function splitOptions(content: string): string[] {
  const options: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of content) {
    if (char === '{') {
      depth++;
      current += char;
    } else if (char === '}') {
      depth--;
      current += char;
    } else if (char === '|' && depth === 0) {
      options.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) options.push(current);
  return options;
}
```

### Task 2: Variation Generator

Add to `/src/lib/spintax/generator.ts`:

```typescript
import { parseSpintax, SpintaxToken, SpintaxResult } from './parser';
import { createHash } from 'crypto';

/**
 * Count total possible variations
 */
export function countVariations(tokens: SpintaxToken[]): number {
  let count = 1;

  for (const token of tokens) {
    if (token.type === 'spin' && token.options) {
      let optionCount = 0;
      for (const option of token.options) {
        optionCount += countVariations(option);
      }
      count *= optionCount;
    }
  }

  return count;
}

/**
 * Generate a specific variation by index
 */
export function generateVariation(tokens: SpintaxToken[], index: number): string {
  let result = '';
  let currentIndex = index;

  for (const token of tokens) {
    if (token.type === 'text') {
      result += token.value;
    } else if (token.type === 'spin' && token.options) {
      // Calculate which option to use
      const optionCounts = token.options.map(opt => countVariations(opt));
      const totalOptions = optionCounts.reduce((a, b) => a + b, 0);

      let optionIndex = currentIndex % totalOptions;
      currentIndex = Math.floor(currentIndex / totalOptions);

      // Find which option this index falls into
      let accumulated = 0;
      for (let i = 0; i < token.options.length; i++) {
        if (optionIndex < accumulated + optionCounts[i]) {
          const subIndex = optionIndex - accumulated;
          result += generateVariation(token.options[i], subIndex);
          break;
        }
        accumulated += optionCounts[i];
      }
    }
  }

  return result;
}

/**
 * Generate a random variation
 */
export function generateRandomVariation(input: string): SpintaxResult {
  const tokens = parseSpintax(input);
  const totalVariations = countVariations(tokens);
  const variationIndex = Math.floor(Math.random() * totalVariations);
  const text = generateVariation(tokens, variationIndex);
  const hash = createHash('md5').update(text).digest('hex').slice(0, 8);

  return { text, hash, variationIndex };
}

/**
 * Generate unique variation for a recipient (deterministic)
 */
export function generateUniqueVariation(
  input: string,
  recipientEmail: string,
  campaignId: string
): SpintaxResult {
  const tokens = parseSpintax(input);
  const totalVariations = countVariations(tokens);

  // Create deterministic index from recipient + campaign
  const seed = createHash('md5')
    .update(`${recipientEmail}:${campaignId}`)
    .digest();

  const seedNumber = seed.readUInt32BE(0);
  const variationIndex = seedNumber % totalVariations;
  const text = generateVariation(tokens, variationIndex);
  const hash = createHash('md5').update(text).digest('hex').slice(0, 8);

  return { text, hash, variationIndex };
}

/**
 * Check if two recipients would get the same variation
 */
export function wouldCollide(
  input: string,
  email1: string,
  email2: string,
  campaignId: string
): boolean {
  const v1 = generateUniqueVariation(input, email1, campaignId);
  const v2 = generateUniqueVariation(input, email2, campaignId);
  return v1.hash === v2.hash;
}

/**
 * Generate all variations (for preview, limit to 100)
 */
export function generateAllVariations(input: string, limit = 100): SpintaxResult[] {
  const tokens = parseSpintax(input);
  const total = countVariations(tokens);
  const results: SpintaxResult[] = [];

  const count = Math.min(total, limit);
  for (let i = 0; i < count; i++) {
    const text = generateVariation(tokens, i);
    const hash = createHash('md5').update(text).digest('hex').slice(0, 8);
    results.push({ text, hash, variationIndex: i });
  }

  return results;
}
```

### Task 3: Spintax API Endpoint

Create `/src/app/api/spintax/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseSpintax,
  countVariations,
  generateAllVariations,
  generateRandomVariation
} from '@/lib/spintax';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, action = 'preview' } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    const tokens = parseSpintax(content);
    const totalVariations = countVariations(tokens);

    if (action === 'count') {
      return NextResponse.json({
        totalVariations,
        isUnique: totalVariations > 1
      });
    }

    if (action === 'preview') {
      const variations = generateAllVariations(content, 20);
      return NextResponse.json({
        totalVariations,
        previews: variations,
        hasMore: totalVariations > 20
      });
    }

    if (action === 'random') {
      const variation = generateRandomVariation(content);
      return NextResponse.json({
        totalVariations,
        variation
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Spintax error:', error);
    return NextResponse.json(
      { error: 'Failed to process spintax' },
      { status: 500 }
    );
  }
}
```

### Task 4: Spintax UI Component

Create `/src/components/campaigns/spintax-editor.tsx`:

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shuffle, Eye, Sparkles } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface SpintaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SpintaxEditor({ value, onChange, placeholder }: SpintaxEditorProps) {
  const [preview, setPreview] = useState<string>('');
  const [totalVariations, setTotalVariations] = useState(0);
  const [allPreviews, setAllPreviews] = useState<string[]>([]);
  const [showPreviews, setShowPreviews] = useState(false);
  const [loading, setLoading] = useState(false);

  const debouncedValue = useDebounce(value, 500);

  // Fetch variation count and preview on change
  useEffect(() => {
    if (!debouncedValue) {
      setTotalVariations(0);
      setPreview('');
      return;
    }

    const fetchPreview = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/spintax', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: debouncedValue, action: 'preview' })
        });

        if (response.ok) {
          const data = await response.json();
          setTotalVariations(data.totalVariations);
          setAllPreviews(data.previews.map((p: any) => p.text));
          if (data.previews.length > 0) {
            setPreview(data.previews[0].text);
          }
        }
      } catch (error) {
        console.error('Failed to fetch spintax preview:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [debouncedValue]);

  const shufflePreview = useCallback(async () => {
    if (!value) return;

    try {
      const response = await fetch('/api/spintax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value, action: 'random' })
      });

      if (response.ok) {
        const data = await response.json();
        setPreview(data.variation.text);
      }
    } catch (error) {
      console.error('Failed to shuffle:', error);
    }
  }, [value]);

  const insertSpintax = useCallback((type: 'greeting' | 'cta' | 'custom') => {
    const templates: Record<string, string> = {
      greeting: '{Hi|Hello|Hey}',
      cta: '{Let me know|Would love to chat|Happy to discuss}',
      custom: '{option1|option2|option3}'
    };

    onChange(value + ' ' + templates[type]);
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Write your email with spintax like {Hi|Hello} {name}...'}
          className="min-h-[200px] font-mono text-sm"
        />

        <div className="absolute top-2 right-2 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertSpintax('greeting')}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Greeting
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => insertSpintax('cta')}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            CTA
          </Button>
        </div>
      </div>

      {totalVariations > 0 && (
        <div className="flex items-center gap-4">
          <Badge variant="secondary">
            {totalVariations.toLocaleString()} unique variations
          </Badge>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={shufflePreview}
            disabled={loading}
          >
            <Shuffle className="h-4 w-4 mr-1" />
            Shuffle Preview
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreviews(!showPreviews)}
          >
            <Eye className="h-4 w-4 mr-1" />
            {showPreviews ? 'Hide' : 'Show'} All
          </Button>
        </div>
      )}

      {preview && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Preview</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <p className="text-sm whitespace-pre-wrap">{preview}</p>
          </CardContent>
        </Card>
      )}

      {showPreviews && allPreviews.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">
              Sample Variations ({allPreviews.length} of {totalVariations})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 max-h-[300px] overflow-y-auto">
            <div className="space-y-2">
              {allPreviews.map((p, i) => (
                <div
                  key={i}
                  className="text-sm p-2 bg-muted rounded border-l-2 border-primary"
                >
                  {p}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### Task 5: Index Export

Create `/src/lib/spintax/index.ts`:

```typescript
export * from './parser';
export * from './generator';
```

## Verification

- [ ] `{Hi|Hello}` produces 2 variations
- [ ] `{Hi|Hello {friend|colleague}}` produces 3 variations (Hi, Hello friend, Hello colleague)
- [ ] Same recipient always gets same variation (deterministic)
- [ ] Different recipients get different variations
- [ ] Preview UI shows all variations
- [ ] API returns correct variation count

## Done When

- Spintax parser handles nested syntax
- Generator produces deterministic variations per recipient
- UI component shows live preview
- API endpoint working
- Unit tests pass
