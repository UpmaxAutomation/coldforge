// Export Status and Download API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getExport } from '@/lib/analytics';

interface RouteParams {
  params: Promise<{ exportId: string }>;
}

// GET /api/analytics/exports/[exportId] - Get export status
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { exportId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const exportResult = await getExport(exportId);

    if (!exportResult) {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: exportData } = await supabase
      .from('report_exports')
      .select('workspace_id')
      .eq('id', exportId)
      .single();

    if (exportData) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', exportData.workspace_id)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    return NextResponse.json(exportResult);
  } catch (error) {
    console.error('Error fetching export:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export' },
      { status: 500 }
    );
  }
}
