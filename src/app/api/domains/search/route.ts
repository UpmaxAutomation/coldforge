// Domain Search API
// POST /api/domains/search

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchDomains, bulkCheckDomains } from '@/lib/domains';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { baseName, domains, tlds } = body;

    // Bulk check if specific domains provided
    if (domains && Array.isArray(domains)) {
      if (domains.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 domains per request' },
          { status: 400 }
        );
      }

      const result = await bulkCheckDomains(domains);

      return NextResponse.json({
        available: result.available,
        unavailable: result.unavailable,
        totalPrice: result.totalPrice,
        availableCount: result.available.length,
        unavailableCount: result.unavailable.length,
      });
    }

    // Search by base name
    if (baseName) {
      const result = await searchDomains(
        baseName.toLowerCase().replace(/[^a-z0-9-]/g, ''),
        tlds || ['com', 'net', 'org', 'io', 'co']
      );

      return NextResponse.json({
        domains: result.domains,
        suggestions: result.suggestions,
      });
    }

    return NextResponse.json(
      { error: 'Provide either baseName or domains array' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Domain search error:', error);
    return NextResponse.json(
      { error: 'Failed to search domains' },
      { status: 500 }
    );
  }
}
