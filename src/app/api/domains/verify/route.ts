// Domain Verify API
// POST /api/domains/verify - Verify DNS propagation for a domain

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyDomainDNS } from '@/lib/domains';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { domainId, domain } = body;

    if (!domainId || !domain) {
      return NextResponse.json(
        { error: 'domainId and domain are required' },
        { status: 400 }
      );
    }

    const result = await verifyDomainDNS(domainId, domain);

    return NextResponse.json({
      verified: result.verified,
      spf: result.spf,
      dkim: result.dkim,
      dmarc: result.dmarc,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Domain verify error:', error);
    return NextResponse.json(
      { error: 'Failed to verify domain' },
      { status: 500 }
    );
  }
}
