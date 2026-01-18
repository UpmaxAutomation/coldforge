// Coupons API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCouponByCode,
  validateCoupon,
  calculateDiscount,
  redeemCoupon,
  listCoupons,
  getWorkspaceRedemptions,
} from '@/lib/billing/coupons';

// GET /api/billing/coupons - Get coupon info
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
    const section = searchParams.get('section'); // redemptions, list

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

    switch (section) {
      case 'redemptions': {
        const redemptions = await getWorkspaceRedemptions(workspaceId);
        return NextResponse.json({ redemptions });
      }

      case 'list': {
        // Admin only - list available coupons
        if (!['owner', 'admin'].includes(member.role)) {
          return NextResponse.json(
            { error: 'Admin access required' },
            { status: 403 }
          );
        }

        const activeOnly = searchParams.get('activeOnly') !== 'false';
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const coupons = await listCoupons({ activeOnly, limit });
        return NextResponse.json({ coupons });
      }

      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error fetching coupons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch coupons' },
      { status: 500 }
    );
  }
}

// POST /api/billing/coupons - Coupon actions
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, workspaceId, code, planId, amountCents, couponId, subscriptionId } = body;

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

    switch (action) {
      case 'validate': {
        if (!code) {
          return NextResponse.json({ error: 'Coupon code required' }, { status: 400 });
        }

        const result = await validateCoupon(code, workspaceId, planId, amountCents);

        if (!result.valid) {
          return NextResponse.json({
            valid: false,
            error: result.error,
          });
        }

        // Calculate discount preview
        let discountAmount = 0;
        if (amountCents && result.coupon) {
          discountAmount = calculateDiscount(result.coupon, amountCents);
        }

        return NextResponse.json({
          valid: true,
          coupon: {
            id: result.coupon!.id,
            code: result.coupon!.code,
            name: result.coupon!.name,
            discountType: result.coupon!.discountType,
            discountPercent: result.coupon!.discountPercent,
            discountAmountCents: result.coupon!.discountAmountCents,
            duration: result.coupon!.duration,
            durationInMonths: result.coupon!.durationInMonths,
          },
          discountAmount,
          finalAmount: amountCents ? amountCents - discountAmount : undefined,
        });
      }

      case 'apply': {
        if (!code) {
          return NextResponse.json({ error: 'Coupon code required' }, { status: 400 });
        }

        // First validate
        const validation = await validateCoupon(code, workspaceId, planId, amountCents);

        if (!validation.valid) {
          return NextResponse.json({
            success: false,
            error: validation.error,
          });
        }

        // Calculate discount
        const discountApplied = amountCents
          ? calculateDiscount(validation.coupon!, amountCents)
          : undefined;

        // Redeem coupon
        const result = await redeemCoupon(
          validation.coupon!.id,
          workspaceId,
          subscriptionId,
          discountApplied
        );

        if (!result.success) {
          return NextResponse.json({
            success: false,
            error: result.error,
          });
        }

        return NextResponse.json({
          success: true,
          redemptionId: result.redemptionId,
          discountApplied,
          coupon: {
            id: validation.coupon!.id,
            code: validation.coupon!.code,
            name: validation.coupon!.name,
            duration: validation.coupon!.duration,
          },
        });
      }

      case 'lookup': {
        if (!code) {
          return NextResponse.json({ error: 'Coupon code required' }, { status: 400 });
        }

        const coupon = await getCouponByCode(code);

        if (!coupon) {
          return NextResponse.json({
            found: false,
          });
        }

        return NextResponse.json({
          found: true,
          coupon: {
            code: coupon.code,
            name: coupon.name,
            description: coupon.description,
            discountType: coupon.discountType,
            discountPercent: coupon.discountPercent,
            discountAmountCents: coupon.discountAmountCents,
            duration: coupon.duration,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing coupon action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
