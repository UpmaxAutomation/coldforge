// Field Mappings API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getIntegration, updateFieldMappings } from '@/lib/integrations';
import type { FieldMapping } from '@/lib/integrations/types';

interface RouteParams {
  params: Promise<{ integrationId: string }>;
}

// GET /api/integrations/[integrationId]/mappings - Get field mappings
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get field mappings from database
    const { data: mappings } = await supabase
      .from('field_mappings')
      .select('*')
      .eq('integration_id', integrationId)
      .order('sort_order', { ascending: true });

    // Get available fields based on provider
    const availableFields = getAvailableFields(integration.provider);

    return NextResponse.json({
      mappings: mappings || [],
      availableFields,
    });
  } catch (error) {
    console.error('Error fetching mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mappings' },
      { status: 500 }
    );
  }
}

// PUT /api/integrations/[integrationId]/mappings - Update field mappings
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { integrationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await getIntegration(integrationId);

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Verify admin access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', integration.workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { mappings } = body as { mappings: FieldMapping[] };

    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Mappings must be an array' },
        { status: 400 }
      );
    }

    // Validate mappings
    for (const mapping of mappings) {
      if (!mapping.sourceField || !mapping.targetField) {
        return NextResponse.json(
          { error: 'Each mapping must have sourceField and targetField' },
          { status: 400 }
        );
      }
    }

    // Delete existing mappings
    await supabase
      .from('field_mappings')
      .delete()
      .eq('integration_id', integrationId);

    // Insert new mappings using admin client to bypass RLS
    if (mappings.length > 0) {
      const mappingsToInsert = mappings.map((mapping, index) => ({
        integration_id: integrationId,
        source_field: mapping.sourceField,
        target_field: mapping.targetField,
        transform: mapping.transform || null,
        is_required: mapping.isRequired || false,
        default_value: mapping.defaultValue || null,
        sort_order: index,
      }));

      const adminClient = createAdminClient();
      const { error: insertError } = await adminClient
        .from('field_mappings')
        .insert(mappingsToInsert);

      if (insertError) {
        throw insertError;
      }
    }

    // Also update sync settings
    await updateFieldMappings(integrationId, mappings);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating mappings:', error);
    return NextResponse.json(
      { error: 'Failed to update mappings' },
      { status: 500 }
    );
  }
}

// Get available fields based on provider
function getAvailableFields(provider: string): {
  source: Array<{ name: string; label: string; type: string }>;
  target: Array<{ name: string; label: string; type: string }>;
} {
  // Local lead fields (target for import, source for export)
  const leadFields = [
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'first_name', label: 'First Name', type: 'string' },
    { name: 'last_name', label: 'Last Name', type: 'string' },
    { name: 'company', label: 'Company', type: 'string' },
    { name: 'title', label: 'Job Title', type: 'string' },
    { name: 'phone', label: 'Phone', type: 'string' },
    { name: 'website', label: 'Website', type: 'string' },
    { name: 'linkedin_url', label: 'LinkedIn URL', type: 'string' },
    { name: 'industry', label: 'Industry', type: 'string' },
    { name: 'company_size', label: 'Company Size', type: 'string' },
    { name: 'location', label: 'Location', type: 'string' },
    { name: 'city', label: 'City', type: 'string' },
    { name: 'state', label: 'State', type: 'string' },
    { name: 'country', label: 'Country', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'tags', label: 'Tags', type: 'array' },
    { name: 'notes', label: 'Notes', type: 'string' },
  ];

  // Provider-specific fields (source for import, target for export)
  const providerFields: Record<
    string,
    Array<{ name: string; label: string; type: string }>
  > = {
    hubspot: [
      { name: 'email', label: 'Email', type: 'string' },
      { name: 'firstname', label: 'First Name', type: 'string' },
      { name: 'lastname', label: 'Last Name', type: 'string' },
      { name: 'company', label: 'Company', type: 'string' },
      { name: 'jobtitle', label: 'Job Title', type: 'string' },
      { name: 'phone', label: 'Phone', type: 'string' },
      { name: 'website', label: 'Website', type: 'string' },
      { name: 'linkedinbio', label: 'LinkedIn Bio', type: 'string' },
      { name: 'industry', label: 'Industry', type: 'string' },
      { name: 'annualrevenue', label: 'Annual Revenue', type: 'number' },
      { name: 'numberofemployees', label: 'Number of Employees', type: 'number' },
      { name: 'city', label: 'City', type: 'string' },
      { name: 'state', label: 'State/Region', type: 'string' },
      { name: 'country', label: 'Country', type: 'string' },
      { name: 'lifecyclestage', label: 'Lifecycle Stage', type: 'string' },
      { name: 'hs_lead_status', label: 'Lead Status', type: 'string' },
    ],
    salesforce: [
      { name: 'Email', label: 'Email', type: 'string' },
      { name: 'FirstName', label: 'First Name', type: 'string' },
      { name: 'LastName', label: 'Last Name', type: 'string' },
      { name: 'Company', label: 'Company', type: 'string' },
      { name: 'Title', label: 'Title', type: 'string' },
      { name: 'Phone', label: 'Phone', type: 'string' },
      { name: 'Website', label: 'Website', type: 'string' },
      { name: 'Industry', label: 'Industry', type: 'string' },
      { name: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency' },
      { name: 'NumberOfEmployees', label: 'Number of Employees', type: 'number' },
      { name: 'City', label: 'City', type: 'string' },
      { name: 'State', label: 'State', type: 'string' },
      { name: 'Country', label: 'Country', type: 'string' },
      { name: 'Status', label: 'Status', type: 'string' },
      { name: 'LeadSource', label: 'Lead Source', type: 'string' },
    ],
    pipedrive: [
      { name: 'email', label: 'Email', type: 'string' },
      { name: 'first_name', label: 'First Name', type: 'string' },
      { name: 'last_name', label: 'Last Name', type: 'string' },
      { name: 'org_name', label: 'Organization', type: 'string' },
      { name: 'phone', label: 'Phone', type: 'string' },
      { name: 'label', label: 'Label', type: 'string' },
    ],
    google_sheets: [
      // Generic column names - will be replaced with actual headers
      { name: 'A', label: 'Column A', type: 'string' },
      { name: 'B', label: 'Column B', type: 'string' },
      { name: 'C', label: 'Column C', type: 'string' },
      { name: 'D', label: 'Column D', type: 'string' },
      { name: 'E', label: 'Column E', type: 'string' },
      { name: 'F', label: 'Column F', type: 'string' },
      { name: 'G', label: 'Column G', type: 'string' },
      { name: 'H', label: 'Column H', type: 'string' },
    ],
  };

  return {
    source: providerFields[provider] || [],
    target: leadFields,
  };
}
