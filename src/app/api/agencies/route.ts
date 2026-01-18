// Agency API Routes
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAgency, getUserAgencies } from '@/lib/whitelabel';

// GET /api/agencies - List user's agencies
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agencies = await getUserAgencies(user.id);

    return NextResponse.json({ agencies });
  } catch (error) {
    console.error('Get agencies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get agencies' },
      { status: 500 }
    );
  }
}

// POST /api/agencies - Create a new agency
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, plan, branding } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const agency = await createAgency(user.id, {
      name,
      slug,
      plan,
      branding,
    });

    return NextResponse.json({ agency }, { status: 201 });
  } catch (error) {
    console.error('Create agency error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create agency' },
      { status: 500 }
    );
  }
}
