// Invoices API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getInvoice,
  getWorkspaceInvoices,
  getBillingStats,
  getUpcomingInvoice,
  type InvoiceStatus,
} from '@/lib/billing/invoices';

// GET /api/billing/invoices - Get invoices
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const invoiceId = searchParams.get('invoiceId');
    const section = searchParams.get('section'); // list, stats, upcoming

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    // Get single invoice
    if (invoiceId) {
      const invoice = await getInvoice(invoiceId);
      if (!invoice || invoice.workspaceId !== workspaceId) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      return NextResponse.json(invoice);
    }

    switch (section) {
      case 'stats': {
        const stats = await getBillingStats(workspaceId);
        return NextResponse.json(stats);
      }

      case 'upcoming': {
        // Get Stripe customer
        const { data: customer } = await supabase
          .from('stripe_customers')
          .select('stripe_customer_id')
          .eq('workspace_id', workspaceId)
          .single();

        if (!customer) {
          return NextResponse.json({ upcoming: null });
        }

        const upcoming = await getUpcomingInvoice(customer.stripe_customer_id);
        return NextResponse.json({ upcoming });
      }

      case 'list':
      default: {
        const status = searchParams.get('status') as InvoiceStatus | null;
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const { invoices, total } = await getWorkspaceInvoices(workspaceId, {
          status: status || undefined,
          limit,
          offset,
        });

        return NextResponse.json({
          invoices,
          total,
          pagination: {
            limit,
            offset,
            hasMore: offset + invoices.length < total,
          },
        });
      }
    }
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
