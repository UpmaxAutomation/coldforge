import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseSpintax,
  validateSpintax,
  countVariations,
  generateRandomVariation,
  generateAllVariations,
  generateUniqueVariation,
  extractSpintaxBlocks
} from '@/lib/spintax';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, content, recipientEmail, campaignId, limit } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    // Validate spintax first
    const validation = validateSpintax(content);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Invalid spintax syntax',
        details: validation.error
      }, { status: 400 });
    }

    switch (action) {
      case 'validate': {
        const tokens = parseSpintax(content);
        const variationCount = countVariations(tokens);
        const blocks = extractSpintaxBlocks(content);

        return NextResponse.json({
          valid: true,
          variationCount,
          spintaxBlocks: blocks.length,
          blocks
        });
      }

      case 'preview': {
        // Generate a random preview
        const result = generateRandomVariation(content);
        return NextResponse.json(result);
      }

      case 'generate': {
        // Generate for specific recipient
        if (!recipientEmail || !campaignId) {
          return NextResponse.json({
            error: 'recipientEmail and campaignId required for generate action'
          }, { status: 400 });
        }
        const result = generateUniqueVariation(content, recipientEmail, campaignId);
        return NextResponse.json(result);
      }

      case 'all': {
        // Generate all variations (with limit)
        const maxLimit = Math.min(limit || 100, 500);
        const results = generateAllVariations(content, maxLimit);
        const tokens = parseSpintax(content);
        const totalCount = countVariations(tokens);

        return NextResponse.json({
          variations: results,
          showing: results.length,
          total: totalCount,
          hasMore: totalCount > maxLimit
        });
      }

      case 'count': {
        const tokens = parseSpintax(content);
        const count = countVariations(tokens);
        return NextResponse.json({ count });
      }

      default: {
        // Default: validate and count
        const tokens = parseSpintax(content);
        const variationCount = countVariations(tokens);
        const preview = generateRandomVariation(content);

        return NextResponse.json({
          valid: true,
          variationCount,
          preview
        });
      }
    }

  } catch (error) {
    console.error('Spintax API error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
