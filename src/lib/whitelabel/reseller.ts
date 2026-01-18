// Reseller Functionality
import { createClient } from '@/lib/supabase/server';
import { ResellerConfig, AgencyPlan, AGENCY_PLAN_LIMITS } from './types';

// Get reseller configuration
export async function getResellerConfig(agencyId: string): Promise<ResellerConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reseller_configs')
    .select('*')
    .eq('agency_id', agencyId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapResellerConfig(data);
}

// Create or update reseller configuration
export async function upsertResellerConfig(
  agencyId: string,
  config: Partial<ResellerConfig>
): Promise<ResellerConfig> {
  const supabase = await createClient();

  // Verify agency has reselling enabled
  const { data: agency, error: agencyError } = await supabase
    .from('agencies')
    .select('settings')
    .eq('id', agencyId)
    .single();

  if (agencyError || !agency) {
    throw new Error('Agency not found');
  }

  if (!agency.settings?.enableReselling) {
    throw new Error('Reselling is not enabled for this agency');
  }

  // Check if exists
  const { data: existing } = await supabase
    .from('reseller_configs')
    .select('id')
    .eq('agency_id', agencyId)
    .single();

  if (existing) {
    // Update
    const { data, error } = await supabase
      .from('reseller_configs')
      .update({
        ...config,
        updated_at: new Date().toISOString(),
      })
      .eq('agency_id', agencyId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update reseller config: ${error.message}`);
    }

    return mapResellerConfig(data);
  } else {
    // Insert
    const { data, error } = await supabase
      .from('reseller_configs')
      .insert({
        agency_id: agencyId,
        enabled: config.enabled ?? true,
        markup: config.markup ?? 20, // Default 20% markup
        min_payout_amount: config.minPayoutAmount ?? 100,
        auto_payouts: config.autoPayouts ?? false,
        ...config,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create reseller config: ${error.message}`);
    }

    return mapResellerConfig(data);
  }
}

// Set custom pricing for a plan
export async function setCustomPlanPricing(
  agencyId: string,
  planId: string,
  price: number,
  currency: string = 'USD'
): Promise<ResellerConfig> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from('reseller_configs')
    .select('custom_pricing')
    .eq('agency_id', agencyId)
    .single();

  if (getError || !current) {
    // Create new config with custom pricing
    return upsertResellerConfig(agencyId, {
      customPricing: [{ planId, price, currency }],
    });
  }

  const customPricing = current.custom_pricing || [];
  const existingIndex = customPricing.findIndex(
    (p: { planId: string }) => p.planId === planId
  );

  if (existingIndex >= 0) {
    customPricing[existingIndex] = { planId, price, currency };
  } else {
    customPricing.push({ planId, price, currency });
  }

  const { data, error } = await supabase
    .from('reseller_configs')
    .update({
      custom_pricing: customPricing,
      updated_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set custom pricing: ${error.message}`);
  }

  return mapResellerConfig(data);
}

// Remove custom pricing for a plan
export async function removeCustomPlanPricing(
  agencyId: string,
  planId: string
): Promise<ResellerConfig> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from('reseller_configs')
    .select('custom_pricing')
    .eq('agency_id', agencyId)
    .single();

  if (getError || !current) {
    throw new Error('Reseller config not found');
  }

  const customPricing = (current.custom_pricing || []).filter(
    (p: { planId: string }) => p.planId !== planId
  );

  const { data, error } = await supabase
    .from('reseller_configs')
    .update({
      custom_pricing: customPricing,
      updated_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to remove custom pricing: ${error.message}`);
  }

  return mapResellerConfig(data);
}

// Calculate reseller price for a plan
export async function calculateResellerPrice(
  agencyId: string,
  planId: string,
  basePrice: number
): Promise<{
  basePrice: number;
  markup: number;
  markupAmount: number;
  finalPrice: number;
  currency: string;
}> {
  const config = await getResellerConfig(agencyId);

  if (!config || !config.enabled) {
    return {
      basePrice,
      markup: 0,
      markupAmount: 0,
      finalPrice: basePrice,
      currency: 'USD',
    };
  }

  // Check for custom pricing
  const customPrice = config.customPricing?.find(p => p.planId === planId);

  if (customPrice) {
    return {
      basePrice,
      markup: 0,
      markupAmount: customPrice.price - basePrice,
      finalPrice: customPrice.price,
      currency: customPrice.currency,
    };
  }

  // Apply percentage markup
  const markupAmount = basePrice * (config.markup / 100);
  const finalPrice = basePrice + markupAmount;

  return {
    basePrice,
    markup: config.markup,
    markupAmount,
    finalPrice,
    currency: 'USD',
  };
}

// Get commission earned
export async function getResellerCommissions(
  agencyId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    status?: 'pending' | 'paid' | 'canceled';
  } = {}
): Promise<{
  commissions: Array<{
    id: string;
    subAccountId: string;
    subAccountName: string;
    amount: number;
    currency: string;
    period: string;
    status: string;
    createdAt: Date;
    paidAt?: Date;
  }>;
  totals: {
    pending: number;
    paid: number;
    total: number;
  };
}> {
  const supabase = await createClient();

  let query = supabase
    .from('reseller_commissions')
    .select(`
      *,
      sub_accounts:sub_account_id (
        name
      )
    `)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (options.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }

  if (options.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get commissions: ${error.message}`);
  }

  const commissions = (data || []).map(c => ({
    id: c.id,
    subAccountId: c.sub_account_id,
    subAccountName: (c.sub_accounts as unknown as { name: string })?.name || '',
    amount: c.amount,
    currency: c.currency,
    period: c.period,
    status: c.status,
    createdAt: new Date(c.created_at),
    paidAt: c.paid_at ? new Date(c.paid_at) : undefined,
  }));

  const totals = {
    pending: commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, 0),
    paid: commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0),
    total: commissions.reduce((sum, c) => sum + c.amount, 0),
  };

  return { commissions, totals };
}

// Record a commission
export async function recordCommission(
  agencyId: string,
  subAccountId: string,
  options: {
    amount: number;
    currency?: string;
    period: string; // YYYY-MM
    description?: string;
  }
): Promise<{ id: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reseller_commissions')
    .insert({
      agency_id: agencyId,
      sub_account_id: subAccountId,
      amount: options.amount,
      currency: options.currency || 'USD',
      period: options.period,
      description: options.description,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to record commission: ${error.message}`);
  }

  return { id: data.id };
}

// Process payout
export async function processResellerPayout(
  agencyId: string,
  options: {
    amount?: number;
    commissionIds?: string[];
  } = {}
): Promise<{
  payoutId: string;
  amount: number;
  commissionsProcessed: number;
}> {
  const supabase = await createClient();

  const config = await getResellerConfig(agencyId);

  if (!config || !config.payoutMethod || !config.payoutDetails) {
    throw new Error('Payout method not configured');
  }

  // Get pending commissions
  let query = supabase
    .from('reseller_commissions')
    .select('id, amount')
    .eq('agency_id', agencyId)
    .eq('status', 'pending');

  if (options.commissionIds?.length) {
    query = query.in('id', options.commissionIds);
  }

  const { data: pendingCommissions, error: getError } = await query;

  if (getError) {
    throw new Error(`Failed to get pending commissions: ${getError.message}`);
  }

  if (!pendingCommissions?.length) {
    throw new Error('No pending commissions to process');
  }

  const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

  if (totalAmount < config.minPayoutAmount) {
    throw new Error(`Minimum payout amount is ${config.minPayoutAmount}`);
  }

  // Create payout record
  const { data: payout, error: payoutError } = await supabase
    .from('reseller_payouts')
    .insert({
      agency_id: agencyId,
      amount: options.amount || totalAmount,
      currency: 'USD',
      method: config.payoutMethod,
      status: 'pending',
      commission_ids: pendingCommissions.map(c => c.id),
    })
    .select('id')
    .single();

  if (payoutError) {
    throw new Error(`Failed to create payout: ${payoutError.message}`);
  }

  // Mark commissions as processing
  await supabase
    .from('reseller_commissions')
    .update({ status: 'processing', payout_id: payout.id })
    .in('id', pendingCommissions.map(c => c.id));

  // In production, this would trigger the actual payout via Stripe/PayPal
  // For now, we'll simulate immediate completion
  await supabase
    .from('reseller_payouts')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', payout.id);

  await supabase
    .from('reseller_commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', pendingCommissions.map(c => c.id));

  return {
    payoutId: payout.id,
    amount: options.amount || totalAmount,
    commissionsProcessed: pendingCommissions.length,
  };
}

// Get payout history
export async function getPayoutHistory(
  agencyId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}
): Promise<{
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    createdAt: Date;
    completedAt?: Date;
  }>;
  total: number;
}> {
  const supabase = await createClient();
  const { page = 1, limit = 20, status } = options;

  let query = supabase
    .from('reseller_payouts')
    .select('*', { count: 'exact' })
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get payouts: ${error.message}`);
  }

  return {
    payouts: (data || []).map(p => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      status: p.status,
      createdAt: new Date(p.created_at),
      completedAt: p.completed_at ? new Date(p.completed_at) : undefined,
    })),
    total: count || 0,
  };
}

// Update payout details
export async function updatePayoutDetails(
  agencyId: string,
  method: 'stripe' | 'paypal' | 'wire',
  details: Record<string, string>
): Promise<ResellerConfig> {
  return upsertResellerConfig(agencyId, {
    payoutMethod: method,
    payoutDetails: details,
  });
}

// Get reseller analytics
export async function getResellerAnalytics(
  agencyId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
  };
  subAccounts: {
    total: number;
    active: number;
    churned: number;
    churnRate: number;
  };
  commissions: {
    earned: number;
    pending: number;
    paid: number;
  };
  avgRevenuePerAccount: number;
}> {
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get sub-account stats
  const { data: subAccounts, error: subAccountsError } = await supabase
    .from('sub_accounts')
    .select('status, created_at')
    .eq('agency_id', agencyId);

  if (subAccountsError) {
    throw new Error(`Failed to get sub-account stats: ${subAccountsError.message}`);
  }

  const totalSubAccounts = subAccounts?.length || 0;
  const activeSubAccounts = subAccounts?.filter(s => s.status === 'active').length || 0;
  const churnedSubAccounts = subAccounts?.filter(s => s.status === 'canceled').length || 0;
  const churnRate = totalSubAccounts > 0 ? (churnedSubAccounts / totalSubAccounts) * 100 : 0;

  // Get commission stats
  const { data: commissions } = await supabase
    .from('reseller_commissions')
    .select('amount, status, created_at')
    .eq('agency_id', agencyId);

  const totalEarned = commissions?.reduce((sum, c) => sum + c.amount, 0) || 0;
  const pendingAmount = commissions
    ?.filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0) || 0;
  const paidAmount = commissions
    ?.filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.amount, 0) || 0;

  // This month's revenue
  const thisMonthRevenue = commissions
    ?.filter(c => new Date(c.created_at) >= startOfMonth)
    .reduce((sum, c) => sum + c.amount, 0) || 0;

  // Last month's revenue
  const lastMonthRevenue = commissions
    ?.filter(c => {
      const date = new Date(c.created_at);
      return date >= startOfLastMonth && date <= endOfLastMonth;
    })
    .reduce((sum, c) => sum + c.amount, 0) || 0;

  // Growth rate
  const growth = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : thisMonthRevenue > 0 ? 100 : 0;

  // Avg revenue per account
  const avgRevenuePerAccount = activeSubAccounts > 0 ? totalEarned / activeSubAccounts : 0;

  return {
    revenue: {
      total: totalEarned,
      thisMonth: thisMonthRevenue,
      lastMonth: lastMonthRevenue,
      growth,
    },
    subAccounts: {
      total: totalSubAccounts,
      active: activeSubAccounts,
      churned: churnedSubAccounts,
      churnRate,
    },
    commissions: {
      earned: totalEarned,
      pending: pendingAmount,
      paid: paidAmount,
    },
    avgRevenuePerAccount,
  };
}

// Get available plans with reseller pricing
export async function getResellerPlans(
  agencyId: string
): Promise<Array<{
  id: string;
  name: string;
  basePrice: number;
  resellerPrice: number;
  markup: number;
  limits: typeof AGENCY_PLAN_LIMITS[AgencyPlan];
}>> {
  const config = await getResellerConfig(agencyId);

  // Base prices (in production, these would come from Stripe)
  const basePrices: Record<string, number> = {
    starter: 49,
    professional: 149,
    enterprise: 499,
    custom: 999,
  };

  const plans: Array<{
    id: string;
    name: string;
    basePrice: number;
    resellerPrice: number;
    markup: number;
    limits: typeof AGENCY_PLAN_LIMITS[AgencyPlan];
  }> = [];

  for (const [planId, basePrice] of Object.entries(basePrices)) {
    const pricing = await calculateResellerPrice(agencyId, planId, basePrice);

    plans.push({
      id: planId,
      name: planId.charAt(0).toUpperCase() + planId.slice(1),
      basePrice,
      resellerPrice: pricing.finalPrice,
      markup: pricing.markup,
      limits: AGENCY_PLAN_LIMITS[planId as AgencyPlan],
    });
  }

  return plans;
}

function mapResellerConfig(data: Record<string, unknown>): ResellerConfig {
  return {
    agencyId: data.agency_id as string,
    enabled: data.enabled as boolean,
    markup: data.markup as number,
    customPricing: data.custom_pricing as ResellerConfig['customPricing'],
    commissionRate: data.commission_rate as number | undefined,
    payoutMethod: data.payout_method as 'stripe' | 'paypal' | 'wire' | undefined,
    payoutDetails: data.payout_details as Record<string, string> | undefined,
    minPayoutAmount: data.min_payout_amount as number,
    autoPayouts: data.auto_payouts as boolean,
  };
}
