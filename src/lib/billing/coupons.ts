// Coupon & Discount Management

import { createClient } from '@/lib/supabase/server';

export interface Coupon {
  id: string;
  code: string;
  stripeCouponId?: string;
  name?: string;
  description?: string;
  discountType: 'percent' | 'amount';
  discountPercent?: number;
  discountAmountCents?: number;
  currency: string;
  maxRedemptions?: number;
  timesRedeemed: number;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number;
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
  appliesToPlans?: string[];
  minAmountCents?: number;
  firstTimeOnly: boolean;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  workspaceId: string;
  subscriptionId?: string;
  redeemedAt: Date;
  expiresAt?: Date;
  discountAppliedCents?: number;
}

// Get coupon by code
export async function getCouponByCode(code: string): Promise<Coupon | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  return mapCoupon(data);
}

// Validate coupon for use
export async function validateCoupon(
  code: string,
  workspaceId: string,
  planId?: string,
  amountCents?: number
): Promise<{
  valid: boolean;
  coupon?: Coupon;
  error?: string;
}> {
  const coupon = await getCouponByCode(code);

  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  // Check if active
  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }

  // Check validity dates
  const now = new Date();
  if (coupon.validFrom > now) {
    return { valid: false, error: 'This coupon is not yet valid' };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { valid: false, error: 'This coupon has expired' };
  }

  // Check max redemptions
  if (coupon.maxRedemptions && coupon.timesRedeemed >= coupon.maxRedemptions) {
    return { valid: false, error: 'This coupon has reached its maximum uses' };
  }

  // Check plan restrictions
  if (planId && coupon.appliesToPlans && coupon.appliesToPlans.length > 0) {
    if (!coupon.appliesToPlans.includes(planId)) {
      return { valid: false, error: 'This coupon does not apply to the selected plan' };
    }
  }

  // Check minimum amount
  if (amountCents && coupon.minAmountCents && amountCents < coupon.minAmountCents) {
    return {
      valid: false,
      error: `Minimum order of $${(coupon.minAmountCents / 100).toFixed(2)} required`,
    };
  }

  // Check first-time only
  if (coupon.firstTimeOnly) {
    const supabase = await createClient();
    const { data: existingSub } = await supabase
      .from('workspace_subscriptions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .single();

    if (existingSub) {
      return { valid: false, error: 'This coupon is only valid for new subscribers' };
    }
  }

  // Check if already redeemed by this workspace
  const supabase = await createClient();
  const { data: existingRedemption } = await supabase
    .from('coupon_redemptions')
    .select('id')
    .eq('coupon_id', coupon.id)
    .eq('workspace_id', workspaceId)
    .single();

  if (existingRedemption) {
    return { valid: false, error: 'You have already used this coupon' };
  }

  return { valid: true, coupon };
}

// Calculate discount amount
export function calculateDiscount(
  coupon: Coupon,
  amountCents: number
): number {
  if (coupon.discountType === 'percent' && coupon.discountPercent) {
    return Math.round(amountCents * (coupon.discountPercent / 100));
  }
  if (coupon.discountType === 'amount' && coupon.discountAmountCents) {
    return Math.min(coupon.discountAmountCents, amountCents);
  }
  return 0;
}

// Redeem coupon
export async function redeemCoupon(
  couponId: string,
  workspaceId: string,
  subscriptionId?: string,
  discountAppliedCents?: number
): Promise<{ success: boolean; redemptionId?: string; error?: string }> {
  const supabase = await createClient();

  // Get coupon
  const { data: coupon, error: couponError } = await supabase
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .single();

  if (couponError || !coupon) {
    return { success: false, error: 'Coupon not found' };
  }

  // Calculate expiration based on duration
  let expiresAt: Date | undefined;
  if (coupon.duration === 'repeating' && coupon.duration_in_months) {
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + coupon.duration_in_months);
  }

  // Create redemption
  const { data: redemption, error: redeemError } = await supabase
    .from('coupon_redemptions')
    .insert({
      coupon_id: couponId,
      workspace_id: workspaceId,
      subscription_id: subscriptionId,
      discount_applied_cents: discountAppliedCents,
      expires_at: expiresAt?.toISOString(),
    })
    .select('id')
    .single();

  if (redeemError) {
    return { success: false, error: redeemError.message };
  }

  // Increment times redeemed
  await supabase
    .from('coupons')
    .update({
      times_redeemed: coupon.times_redeemed + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', couponId);

  return { success: true, redemptionId: redemption.id };
}

// Create coupon
export async function createCoupon(
  coupon: Omit<Coupon, 'id' | 'timesRedeemed'>
): Promise<{ success: boolean; couponId?: string; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code: coupon.code.toUpperCase(),
      stripe_coupon_id: coupon.stripeCouponId,
      name: coupon.name,
      description: coupon.description,
      discount_type: coupon.discountType,
      discount_percent: coupon.discountPercent,
      discount_amount_cents: coupon.discountAmountCents,
      currency: coupon.currency,
      max_redemptions: coupon.maxRedemptions,
      times_redeemed: 0,
      duration: coupon.duration,
      duration_in_months: coupon.durationInMonths,
      valid_from: coupon.validFrom.toISOString(),
      valid_until: coupon.validUntil?.toISOString(),
      is_active: coupon.isActive,
      applies_to_plans: coupon.appliesToPlans,
      min_amount_cents: coupon.minAmountCents,
      first_time_only: coupon.firstTimeOnly,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, couponId: data.id };
}

// List active coupons
export async function listCoupons(options: {
  activeOnly?: boolean;
  limit?: number;
} = {}): Promise<Coupon[]> {
  const supabase = await createClient();
  const { activeOnly = true, limit = 50 } = options;

  let query = supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map(mapCoupon);
}

// Deactivate coupon
export async function deactivateCoupon(
  couponId: string
): Promise<{ success: boolean }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('coupons')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', couponId);

  return { success: !error };
}

// Get workspace coupon redemptions
export async function getWorkspaceRedemptions(
  workspaceId: string
): Promise<CouponRedemption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('redeemed_at', { ascending: false });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    couponId: r.coupon_id,
    workspaceId: r.workspace_id,
    subscriptionId: r.subscription_id,
    redeemedAt: new Date(r.redeemed_at),
    expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
    discountAppliedCents: r.discount_applied_cents,
  }));
}

// Helper function to map database row to Coupon type
function mapCoupon(data: Record<string, unknown>): Coupon {
  return {
    id: data.id as string,
    code: data.code as string,
    stripeCouponId: data.stripe_coupon_id as string | undefined,
    name: data.name as string | undefined,
    description: data.description as string | undefined,
    discountType: data.discount_type as 'percent' | 'amount',
    discountPercent: data.discount_percent as number | undefined,
    discountAmountCents: data.discount_amount_cents as number | undefined,
    currency: (data.currency as string) || 'usd',
    maxRedemptions: data.max_redemptions as number | undefined,
    timesRedeemed: (data.times_redeemed as number) || 0,
    duration: data.duration as 'once' | 'repeating' | 'forever',
    durationInMonths: data.duration_in_months as number | undefined,
    validFrom: new Date(data.valid_from as string),
    validUntil: data.valid_until ? new Date(data.valid_until as string) : undefined,
    isActive: data.is_active as boolean,
    appliesToPlans: data.applies_to_plans as string[] | undefined,
    minAmountCents: data.min_amount_cents as number | undefined,
    firstTimeOnly: data.first_time_only as boolean,
  };
}
