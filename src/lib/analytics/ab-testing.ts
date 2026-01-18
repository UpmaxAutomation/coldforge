// A/B Testing Framework
import { createClient } from '@/lib/supabase/server';
import type { ABTest, ABTestVariant, ABTestResult } from './types';

// Create A/B Test
export async function createABTest(
  test: Omit<ABTest, 'id' | 'createdAt' | 'variants'>
): Promise<ABTest> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ab_tests')
    .insert({
      workspace_id: test.workspaceId,
      campaign_id: test.campaignId,
      name: test.name,
      description: test.description || null,
      status: test.status,
      test_type: test.testType,
      winning_metric: test.winningMetric,
      confidence_level: test.confidenceLevel,
      auto_select_winner: test.autoSelectWinner,
      minimum_sample_size: test.minimumSampleSize,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    campaignId: data.campaign_id,
    name: data.name,
    description: data.description,
    status: data.status,
    testType: data.test_type,
    winningMetric: data.winning_metric,
    confidenceLevel: data.confidence_level,
    autoSelectWinner: data.auto_select_winner,
    minimumSampleSize: data.minimum_sample_size,
    variants: [],
    createdAt: new Date(data.created_at),
  };
}

// Get A/B Test
export async function getABTest(testId: string): Promise<ABTest | null> {
  const supabase = await createClient();

  const { data: testData, error: testError } = await supabase
    .from('ab_tests')
    .select('*')
    .eq('id', testId)
    .single();

  if (testError || !testData) return null;

  const { data: variants } = await supabase
    .from('ab_test_variants')
    .select('*')
    .eq('test_id', testId)
    .order('created_at', { ascending: true });

  return {
    id: testData.id,
    workspaceId: testData.workspace_id,
    campaignId: testData.campaign_id,
    name: testData.name,
    description: testData.description,
    status: testData.status,
    testType: testData.test_type,
    winningMetric: testData.winning_metric,
    confidenceLevel: testData.confidence_level,
    autoSelectWinner: testData.auto_select_winner,
    minimumSampleSize: testData.minimum_sample_size,
    winningVariantId: testData.winning_variant_id,
    winnerDeterminedAt: testData.winner_determined_at
      ? new Date(testData.winner_determined_at)
      : undefined,
    variants: (variants || []).map(mapVariant),
    createdAt: new Date(testData.created_at),
    startedAt: testData.started_at ? new Date(testData.started_at) : undefined,
    endedAt: testData.ended_at ? new Date(testData.ended_at) : undefined,
  };
}

// List A/B Tests
export async function listABTests(
  workspaceId: string,
  options: {
    campaignId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ tests: ABTest[]; total: number }> {
  const supabase = await createClient();
  const { campaignId, status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('ab_tests')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  // Get variants for all tests
  const testIds = (data || []).map((t) => t.id);
  const { data: allVariants } = await supabase
    .from('ab_test_variants')
    .select('*')
    .in('test_id', testIds);

  const variantsByTest = (allVariants || []).reduce(
    (acc, v) => {
      if (!acc[v.test_id]) acc[v.test_id] = [];
      acc[v.test_id].push(mapVariant(v));
      return acc;
    },
    {} as Record<string, ABTestVariant[]>
  );

  const tests: ABTest[] = (data || []).map((t) => ({
    id: t.id,
    workspaceId: t.workspace_id,
    campaignId: t.campaign_id,
    name: t.name,
    description: t.description,
    status: t.status,
    testType: t.test_type,
    winningMetric: t.winning_metric,
    confidenceLevel: t.confidence_level,
    autoSelectWinner: t.auto_select_winner,
    minimumSampleSize: t.minimum_sample_size,
    winningVariantId: t.winning_variant_id,
    winnerDeterminedAt: t.winner_determined_at
      ? new Date(t.winner_determined_at)
      : undefined,
    variants: variantsByTest[t.id] || [],
    createdAt: new Date(t.created_at),
    startedAt: t.started_at ? new Date(t.started_at) : undefined,
    endedAt: t.ended_at ? new Date(t.ended_at) : undefined,
  }));

  return { tests, total: count || 0 };
}

// Add Variant to Test
export async function addVariant(
  testId: string,
  variant: Omit<ABTestVariant, 'id' | 'testId' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'openRate' | 'clickRate' | 'replyRate'>
): Promise<ABTestVariant> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ab_test_variants')
    .insert({
      test_id: testId,
      name: variant.name,
      type: variant.type,
      content: variant.content,
      weight: variant.weight,
    })
    .select()
    .single();

  if (error) throw error;

  return mapVariant(data);
}

// Update Variant
export async function updateVariant(
  variantId: string,
  updates: Partial<Pick<ABTestVariant, 'name' | 'content' | 'weight'>>
): Promise<ABTestVariant> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.content !== undefined) updateData.content = updates.content;
  if (updates.weight !== undefined) updateData.weight = updates.weight;

  const { data, error } = await supabase
    .from('ab_test_variants')
    .update(updateData)
    .eq('id', variantId)
    .select()
    .single();

  if (error) throw error;

  return mapVariant(data);
}

// Delete Variant
export async function deleteVariant(variantId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('ab_test_variants')
    .delete()
    .eq('id', variantId);

  if (error) throw error;
}

// Start Test
export async function startTest(testId: string): Promise<ABTest> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ab_tests')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', testId)
    .select()
    .single();

  if (error) throw error;

  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  return test;
}

// Pause Test
export async function pauseTest(testId: string): Promise<ABTest> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('ab_tests')
    .update({ status: 'paused' })
    .eq('id', testId);

  if (error) throw error;

  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  return test;
}

// Resume Test
export async function resumeTest(testId: string): Promise<ABTest> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('ab_tests')
    .update({ status: 'running' })
    .eq('id', testId);

  if (error) throw error;

  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  return test;
}

// Complete Test
export async function completeTest(
  testId: string,
  winningVariantId?: string
): Promise<ABTest> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    status: 'completed',
    ended_at: new Date().toISOString(),
  };

  if (winningVariantId) {
    updateData.winning_variant_id = winningVariantId;
    updateData.winner_determined_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('ab_tests')
    .update(updateData)
    .eq('id', testId);

  if (error) throw error;

  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  return test;
}

// Record Email Event for Variant
export async function recordVariantEvent(
  variantId: string,
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced'
): Promise<void> {
  const supabase = await createClient();

  const columnMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    opened: 'opened',
    clicked: 'clicked',
    replied: 'replied',
    bounced: 'bounced',
  };

  const column = columnMap[eventType];
  if (!column) return;

  // Use RPC for atomic increment
  const { error } = await supabase.rpc('increment_variant_stat', {
    p_variant_id: variantId,
    p_column: column,
  });

  if (error) {
    // Fallback to read-update if RPC doesn't exist
    const { data: variant } = await supabase
      .from('ab_test_variants')
      .select(column)
      .eq('id', variantId)
      .single();

    if (variant) {
      const currentValue = (variant[column] as number) || 0;
      await supabase
        .from('ab_test_variants')
        .update({ [column]: currentValue + 1 })
        .eq('id', variantId);
    }
  }
}

// Get Variant for Email (weighted random selection)
export async function selectVariantForEmail(
  testId: string
): Promise<ABTestVariant | null> {
  const test = await getABTest(testId);
  if (!test || test.status !== 'running' || test.variants.length === 0) {
    return null;
  }

  // Weighted random selection
  const totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const variant of test.variants) {
    random -= variant.weight;
    if (random <= 0) {
      return variant;
    }
  }

  // Fallback to first variant
  return test.variants[0];
}

// Calculate Test Results
export async function calculateTestResults(testId: string): Promise<ABTestResult> {
  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  const variants = test.variants;
  if (variants.length < 2) {
    return {
      testId,
      variants,
      confidence: 0,
      isStatisticallySignificant: false,
      sampleSizeReached: false,
      recommendation: 'Need at least 2 variants to compare',
    };
  }

  // Check if minimum sample size reached
  const totalSent = variants.reduce((sum, v) => sum + v.sent, 0);
  const sampleSizeReached = totalSent >= test.minimumSampleSize;

  // Get metric values based on winning metric
  const getMetricValue = (v: ABTestVariant): number => {
    switch (test.winningMetric) {
      case 'opens':
        return v.openRate;
      case 'clicks':
        return v.clickRate;
      case 'replies':
        return v.replyRate;
      default:
        return v.openRate;
    }
  };

  // Sort variants by performance
  const sortedVariants = [...variants].sort(
    (a, b) => getMetricValue(b) - getMetricValue(a)
  );

  const bestVariant = sortedVariants[0];
  const secondBest = sortedVariants[1];

  // Calculate statistical significance using Z-test for proportions
  const { confidence, isSignificant } = calculateStatisticalSignificance(
    bestVariant,
    secondBest,
    test.winningMetric,
    test.confidenceLevel
  );

  // Determine winner
  let winner: ABTestVariant | undefined;
  let recommendation: string;

  if (!sampleSizeReached) {
    recommendation = `Need ${test.minimumSampleSize - totalSent} more emails to reach minimum sample size`;
  } else if (isSignificant) {
    winner = bestVariant;
    recommendation = `"${bestVariant.name}" is the winner with ${(getMetricValue(bestVariant) * 100).toFixed(2)}% ${test.winningMetric} rate (${(confidence * 100).toFixed(1)}% confidence)`;
  } else {
    recommendation = `No statistically significant winner yet. "${bestVariant.name}" is leading but difference is not significant at ${test.confidenceLevel * 100}% confidence level`;
  }

  return {
    testId,
    variants: sortedVariants,
    winner,
    confidence,
    isStatisticallySignificant: isSignificant,
    sampleSizeReached,
    recommendation,
  };
}

// Statistical significance calculation using Z-test
function calculateStatisticalSignificance(
  variantA: ABTestVariant,
  variantB: ABTestVariant,
  metric: 'opens' | 'clicks' | 'replies',
  requiredConfidence: number
): { confidence: number; isSignificant: boolean } {
  const getCount = (v: ABTestVariant): number => {
    switch (metric) {
      case 'opens':
        return v.opened;
      case 'clicks':
        return v.clicked;
      case 'replies':
        return v.replied;
      default:
        return v.opened;
    }
  };

  const nA = variantA.sent;
  const nB = variantB.sent;
  const successA = getCount(variantA);
  const successB = getCount(variantB);

  if (nA === 0 || nB === 0) {
    return { confidence: 0, isSignificant: false };
  }

  const pA = successA / nA;
  const pB = successB / nB;

  // Pooled proportion
  const pPooled = (successA + successB) / (nA + nB);

  // Standard error
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

  if (se === 0) {
    return { confidence: 0, isSignificant: false };
  }

  // Z-score
  const zScore = Math.abs(pA - pB) / se;

  // Convert Z-score to confidence using normal CDF approximation
  const confidence = normalCDF(zScore);

  // Check against required confidence level
  const isSignificant = confidence >= requiredConfidence;

  return { confidence, isSignificant };
}

// Normal CDF approximation (Abramowitz and Stegun)
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Auto-select winner if conditions are met
export async function checkAndSelectWinner(testId: string): Promise<ABTest> {
  const test = await getABTest(testId);
  if (!test) throw new Error('Test not found');

  if (test.status !== 'running' || !test.autoSelectWinner) {
    return test;
  }

  const results = await calculateTestResults(testId);

  if (results.sampleSizeReached && results.isStatisticallySignificant && results.winner) {
    return await completeTest(testId, results.winner.id);
  }

  return test;
}

// Delete Test
export async function deleteTest(testId: string): Promise<void> {
  const supabase = await createClient();

  // Delete variants first (cascade should handle this, but being explicit)
  await supabase.from('ab_test_variants').delete().eq('test_id', testId);

  const { error } = await supabase.from('ab_tests').delete().eq('id', testId);

  if (error) throw error;
}

// Helper: Map database variant to type
function mapVariant(data: Record<string, unknown>): ABTestVariant {
  const sent = (data.sent as number) || 0;
  const delivered = (data.delivered as number) || 0;
  const opened = (data.opened as number) || 0;
  const clicked = (data.clicked as number) || 0;
  const replied = (data.replied as number) || 0;

  return {
    id: data.id as string,
    testId: data.test_id as string,
    name: data.name as string,
    type: data.type as 'subject' | 'body' | 'sender' | 'timing',
    content: (data.content as ABTestVariant['content']) || {},
    weight: (data.weight as number) || 50,
    sent,
    delivered,
    opened,
    clicked,
    replied,
    bounced: (data.bounced as number) || 0,
    openRate: sent > 0 ? opened / sent : 0,
    clickRate: sent > 0 ? clicked / sent : 0,
    replyRate: sent > 0 ? replied / sent : 0,
  };
}

// Get Apply Variant Content - returns content with variant applied
export function applyVariantContent(
  variant: ABTestVariant,
  originalEmail: {
    subject: string;
    body: string;
    senderName?: string;
    senderEmail?: string;
  }
): {
  subject: string;
  body: string;
  senderName?: string;
  senderEmail?: string;
} {
  const result = { ...originalEmail };

  switch (variant.type) {
    case 'subject':
      if (variant.content.subject) {
        result.subject = variant.content.subject;
      }
      break;
    case 'body':
      if (variant.content.body) {
        result.body = variant.content.body;
      }
      break;
    case 'sender':
      if (variant.content.senderName) {
        result.senderName = variant.content.senderName;
      }
      if (variant.content.senderEmail) {
        result.senderEmail = variant.content.senderEmail;
      }
      break;
    case 'timing':
      // Timing is handled separately in the scheduler
      break;
  }

  return result;
}
