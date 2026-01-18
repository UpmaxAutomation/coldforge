// Invoice Management

import { createClient } from '@/lib/supabase/server';
import { getStripe } from './stripe';

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface Invoice {
  id: string;
  workspaceId: string;
  stripeInvoiceId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  periodStart?: Date;
  periodEnd?: Date;
  dueDate?: Date;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
  lineItems: InvoiceLineItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  periodStart?: Date;
  periodEnd?: Date;
}

// Get invoice by ID
export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('invoices')
    .select(
      `
      *,
      invoice_line_items (*)
    `
    )
    .eq('id', invoiceId)
    .single();

  if (error || !data) return null;

  return mapInvoice(data);
}

// Get invoices for workspace
export async function getWorkspaceInvoices(
  workspaceId: string,
  options: {
    status?: InvoiceStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ invoices: Invoice[]; total: number }> {
  const supabase = await createClient();
  const { status, limit = 20, offset = 0 } = options;

  let query = supabase
    .from('invoices')
    .select(
      `
      *,
      invoice_line_items (*)
    `,
      { count: 'exact' }
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    return { invoices: [], total: 0 };
  }

  return {
    invoices: data.map(mapInvoice),
    total: count ?? 0,
  };
}

// Create invoice
export async function createInvoice(
  workspaceId: string,
  invoice: {
    subtotalCents: number;
    discountCents?: number;
    taxCents?: number;
    currency?: string;
    periodStart?: Date;
    periodEnd?: Date;
    dueDate?: Date;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitAmountCents: number;
      periodStart?: Date;
      periodEnd?: Date;
    }>;
  }
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  const supabase = await createClient();

  const discountCents = invoice.discountCents || 0;
  const taxCents = invoice.taxCents || 0;
  const totalCents = invoice.subtotalCents - discountCents + taxCents;

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(workspaceId);

  // Create invoice
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      workspace_id: workspaceId,
      invoice_number: invoiceNumber,
      status: 'draft',
      subtotal_cents: invoice.subtotalCents,
      discount_cents: discountCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      amount_paid_cents: 0,
      amount_due_cents: totalCents,
      currency: invoice.currency || 'usd',
      period_start: invoice.periodStart?.toISOString(),
      period_end: invoice.periodEnd?.toISOString(),
      due_date: invoice.dueDate?.toISOString(),
    })
    .select('id')
    .single();

  if (invoiceError) {
    return { success: false, error: invoiceError.message };
  }

  // Create line items
  const lineItems = invoice.lineItems.map((item) => ({
    invoice_id: invoiceData.id,
    description: item.description,
    quantity: item.quantity,
    unit_amount_cents: item.unitAmountCents,
    amount_cents: item.quantity * item.unitAmountCents,
    period_start: item.periodStart?.toISOString(),
    period_end: item.periodEnd?.toISOString(),
  }));

  const { error: lineError } = await supabase
    .from('invoice_line_items')
    .insert(lineItems);

  if (lineError) {
    // Rollback invoice
    await supabase.from('invoices').delete().eq('id', invoiceData.id);
    return { success: false, error: lineError.message };
  }

  return { success: true, invoiceId: invoiceData.id };
}

// Generate unique invoice number
async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const supabase = await createClient();

  // Get workspace prefix
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('slug')
    .eq('id', workspaceId)
    .single();

  const prefix = workspace?.slug?.substring(0, 3).toUpperCase() || 'INV';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');

  // Get count of invoices this month
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonth.toISOString());

  const sequence = ((count || 0) + 1).toString().padStart(4, '0');

  return `${prefix}-${year}${month}-${sequence}`;
}

// Finalize invoice (mark as open)
export async function finalizeInvoice(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('status', 'draft');

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Mark invoice as paid
export async function markInvoicePaid(
  invoiceId: string,
  options?: {
    amountPaidCents?: number;
    paidAt?: Date;
    stripePaymentIntentId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get invoice
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('total_cents, amount_paid_cents')
    .eq('id', invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  const amountPaid = options?.amountPaidCents ?? invoice.total_cents;
  const amountDue = invoice.total_cents - amountPaid;

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      amount_paid_cents: amountPaid,
      amount_due_cents: amountDue,
      paid_at: (options?.paidAt ?? new Date()).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Record billing event
  await recordBillingEvent(invoiceId, 'invoice_paid', {
    amount: amountPaid,
    stripePaymentIntentId: options?.stripePaymentIntentId,
  });

  return { success: true };
}

// Void invoice
export async function voidInvoice(
  invoiceId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  if (invoice.status === 'paid') {
    return { success: false, error: 'Cannot void a paid invoice' };
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'void',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Record billing event
  await recordBillingEvent(invoiceId, 'invoice_voided', { reason });

  return { success: true };
}

// Sync invoice from Stripe
export async function syncStripeInvoice(
  stripeInvoiceId: string,
  workspaceId: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  const stripe = getStripe();
  const supabase = await createClient();

  try {
    const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId, {
      expand: ['lines.data'],
    });

    // Check if invoice exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('stripe_invoice_id', stripeInvoiceId)
      .single();

    const invoiceData = {
      workspace_id: workspaceId,
      stripe_invoice_id: stripeInvoiceId,
      invoice_number: stripeInvoice.number || `STR-${stripeInvoiceId.slice(-8)}`,
      status: mapStripeStatus(stripeInvoice.status),
      subtotal_cents: stripeInvoice.subtotal,
      discount_cents: stripeInvoice.total_discount_amounts?.reduce(
        (sum, d) => sum + d.amount,
        0
      ) || 0,
      tax_cents: stripeInvoice.tax || 0,
      total_cents: stripeInvoice.total,
      amount_paid_cents: stripeInvoice.amount_paid,
      amount_due_cents: stripeInvoice.amount_due,
      currency: stripeInvoice.currency,
      period_start: stripeInvoice.period_start
        ? new Date(stripeInvoice.period_start * 1000).toISOString()
        : null,
      period_end: stripeInvoice.period_end
        ? new Date(stripeInvoice.period_end * 1000).toISOString()
        : null,
      due_date: stripeInvoice.due_date
        ? new Date(stripeInvoice.due_date * 1000).toISOString()
        : null,
      paid_at: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
      invoice_pdf_url: stripeInvoice.invoice_pdf,
      updated_at: new Date().toISOString(),
    };

    let invoiceId: string;

    if (existing) {
      // Update existing
      invoiceId = existing.id;
      await supabase
        .from('invoices')
        .update(invoiceData)
        .eq('id', existing.id);

      // Delete old line items
      await supabase
        .from('invoice_line_items')
        .delete()
        .eq('invoice_id', existing.id);
    } else {
      // Create new
      const { data, error } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select('id')
        .single();

      if (error) throw error;
      invoiceId = data.id;
    }

    // Insert line items
    const lineItems = stripeInvoice.lines.data.map((line) => ({
      invoice_id: invoiceId,
      description: line.description || 'Subscription',
      quantity: line.quantity || 1,
      unit_amount_cents: line.unit_amount_excluding_tax
        ? parseInt(line.unit_amount_excluding_tax)
        : line.amount,
      amount_cents: line.amount,
      period_start: line.period?.start
        ? new Date(line.period.start * 1000).toISOString()
        : null,
      period_end: line.period?.end
        ? new Date(line.period.end * 1000).toISOString()
        : null,
    }));

    if (lineItems.length > 0) {
      await supabase.from('invoice_line_items').insert(lineItems);
    }

    return { success: true, invoiceId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync invoice',
    };
  }
}

// Map Stripe invoice status to our status
function mapStripeStatus(
  stripeStatus: string | null | undefined
): InvoiceStatus {
  switch (stripeStatus) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'open';
    case 'paid':
      return 'paid';
    case 'void':
      return 'void';
    case 'uncollectible':
      return 'uncollectible';
    default:
      return 'draft';
  }
}

// Record billing event
async function recordBillingEvent(
  invoiceId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();

  // Get invoice workspace
  const { data: invoice } = await supabase
    .from('invoices')
    .select('workspace_id')
    .eq('id', invoiceId)
    .single();

  if (invoice) {
    await supabase.from('billing_events').insert({
      workspace_id: invoice.workspace_id,
      event_type: eventType,
      data: {
        invoice_id: invoiceId,
        ...data,
      },
    });
  }
}

// Get upcoming invoice preview from Stripe
export async function getUpcomingInvoice(
  stripeCustomerId: string
): Promise<{
  subtotalCents: number;
  totalCents: number;
  nextPaymentDate?: Date;
  lineItems: Array<{
    description: string;
    amount: number;
  }>;
} | null> {
  const stripe = getStripe();

  try {
    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: stripeCustomerId,
    });

    return {
      subtotalCents: upcoming.subtotal,
      totalCents: upcoming.total,
      nextPaymentDate: upcoming.next_payment_attempt
        ? new Date(upcoming.next_payment_attempt * 1000)
        : undefined,
      lineItems: upcoming.lines.data.map((line) => ({
        description: line.description || 'Subscription',
        amount: line.amount,
      })),
    };
  } catch {
    return null;
  }
}

// Get billing stats for workspace
export async function getBillingStats(
  workspaceId: string
): Promise<{
  totalPaid: number;
  totalDue: number;
  invoiceCount: number;
  paidCount: number;
  overdueCount: number;
}> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('status, amount_paid_cents, amount_due_cents, due_date')
    .eq('workspace_id', workspaceId);

  if (!invoices) {
    return {
      totalPaid: 0,
      totalDue: 0,
      invoiceCount: 0,
      paidCount: 0,
      overdueCount: 0,
    };
  }

  const now = new Date();
  let totalPaid = 0;
  let totalDue = 0;
  let paidCount = 0;
  let overdueCount = 0;

  for (const inv of invoices) {
    totalPaid += inv.amount_paid_cents;
    totalDue += inv.amount_due_cents;

    if (inv.status === 'paid') {
      paidCount++;
    }

    if (
      inv.status === 'open' &&
      inv.due_date &&
      new Date(inv.due_date) < now
    ) {
      overdueCount++;
    }
  }

  return {
    totalPaid,
    totalDue,
    invoiceCount: invoices.length,
    paidCount,
    overdueCount,
  };
}

// Helper to map database row to Invoice type
function mapInvoice(data: Record<string, unknown>): Invoice {
  const lineItems = (data.invoice_line_items as Record<string, unknown>[]) || [];

  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    stripeInvoiceId: data.stripe_invoice_id as string | undefined,
    invoiceNumber: data.invoice_number as string,
    status: data.status as InvoiceStatus,
    subtotalCents: data.subtotal_cents as number,
    discountCents: data.discount_cents as number,
    taxCents: data.tax_cents as number,
    totalCents: data.total_cents as number,
    amountPaidCents: data.amount_paid_cents as number,
    amountDueCents: data.amount_due_cents as number,
    currency: (data.currency as string) || 'usd',
    periodStart: data.period_start
      ? new Date(data.period_start as string)
      : undefined,
    periodEnd: data.period_end
      ? new Date(data.period_end as string)
      : undefined,
    dueDate: data.due_date ? new Date(data.due_date as string) : undefined,
    paidAt: data.paid_at ? new Date(data.paid_at as string) : undefined,
    hostedInvoiceUrl: data.hosted_invoice_url as string | undefined,
    invoicePdfUrl: data.invoice_pdf_url as string | undefined,
    lineItems: lineItems.map((item) => ({
      id: item.id as string,
      invoiceId: item.invoice_id as string,
      description: item.description as string,
      quantity: item.quantity as number,
      unitAmountCents: item.unit_amount_cents as number,
      amountCents: item.amount_cents as number,
      periodStart: item.period_start
        ? new Date(item.period_start as string)
        : undefined,
      periodEnd: item.period_end
        ? new Date(item.period_end as string)
        : undefined,
    })),
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}
