// HubSpot Integration

import type {
  Integration,
  IntegrationCredentials,
  CRMContact,
  SyncResult,
  SyncError,
  FieldMapping,
} from '../types';
import { getIntegrationCredentials, updateLastSync } from '../manager';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    company?: string;
    phone?: string;
    jobtitle?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

// Fetch contacts from HubSpot
export async function fetchContacts(
  credentials: IntegrationCredentials,
  options: {
    limit?: number;
    after?: string;
    properties?: string[];
  } = {}
): Promise<{
  contacts: HubSpotContact[];
  paging?: { next?: { after: string } };
}> {
  const { limit = 100, after, properties = ['email', 'firstname', 'lastname', 'company', 'phone', 'jobtitle'] } = options;

  const params = new URLSearchParams({
    limit: limit.toString(),
    properties: properties.join(','),
  });

  if (after) {
    params.set('after', after);
  }

  const response = await fetch(
    `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?${params}`,
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch HubSpot contacts');
  }

  const data = await response.json();
  return {
    contacts: data.results,
    paging: data.paging,
  };
}

// Create contact in HubSpot
export async function createContact(
  credentials: IntegrationCredentials,
  contact: CRMContact
): Promise<{ success: boolean; hubspotId?: string; error?: string }> {
  const properties: Record<string, string> = {
    email: contact.email,
  };

  if (contact.firstName) properties.firstname = contact.firstName;
  if (contact.lastName) properties.lastname = contact.lastName;
  if (contact.company) properties.company = contact.company;
  if (contact.phone) properties.phone = contact.phone;
  if (contact.title) properties.jobtitle = contact.title;

  // Add custom fields
  if (contact.customFields) {
    for (const [key, value] of Object.entries(contact.customFields)) {
      if (typeof value === 'string') {
        properties[key] = value;
      }
    }
  }

  const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (response.ok) {
    const data = await response.json();
    return { success: true, hubspotId: data.id };
  }

  const error = await response.json();
  return { success: false, error: error.message || 'Failed to create contact' };
}

// Update contact in HubSpot
export async function updateContact(
  credentials: IntegrationCredentials,
  hubspotId: string,
  updates: Partial<CRMContact>
): Promise<{ success: boolean; error?: string }> {
  const properties: Record<string, string> = {};

  if (updates.email) properties.email = updates.email;
  if (updates.firstName) properties.firstname = updates.firstName;
  if (updates.lastName) properties.lastname = updates.lastName;
  if (updates.company) properties.company = updates.company;
  if (updates.phone) properties.phone = updates.phone;
  if (updates.title) properties.jobtitle = updates.title;

  if (updates.customFields) {
    for (const [key, value] of Object.entries(updates.customFields)) {
      if (typeof value === 'string') {
        properties[key] = value;
      }
    }
  }

  const response = await fetch(
    `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${hubspotId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    }
  );

  if (response.ok) {
    return { success: true };
  }

  const error = await response.json();
  return { success: false, error: error.message || 'Failed to update contact' };
}

// Sync contacts from HubSpot to local database
export async function syncContactsFromHubSpot(
  integrationId: string,
  workspaceId: string,
  fieldMappings: FieldMapping[]
): Promise<SyncResult> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return {
      success: false,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsFailed: 0,
      errors: [{ message: 'No credentials found', code: 'NO_CREDENTIALS' }],
    };
  }

  const { createClient } = await import('@/lib/supabase/server');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = await createClient();
  const adminClient = createAdminClient();

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const errors: SyncError[] = [];
  let after: string | undefined;

  try {
    // Fetch all contacts with pagination
    do {
      const { contacts, paging } = await fetchContacts(credentials, { after });

      for (const hubspotContact of contacts) {
        try {
          const email = hubspotContact.properties.email;
          if (!email) continue;

          // Check if lead exists
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('email', email)
            .single();

          // Map fields
          const leadData = mapHubSpotToLead(hubspotContact, fieldMappings);
          leadData.workspace_id = workspaceId;
          leadData.source = 'hubspot';
          leadData.external_id = hubspotContact.id;

          if (existingLead) {
            // Update existing lead using admin client
            await adminClient
              .from('leads')
              .update({
                ...leadData,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingLead.id);
            recordsUpdated++;
          } else {
            // Create new lead using admin client to bypass RLS
            await adminClient.from('leads').insert(leadData);
            recordsCreated++;
          }
        } catch (error) {
          errors.push({
            recordId: hubspotContact.id,
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'SYNC_ERROR',
          });
        }
      }

      after = paging?.next?.after;
    } while (after);

    // Update last sync time
    await updateLastSync(integrationId);

    return {
      success: errors.length === 0,
      recordsCreated,
      recordsUpdated,
      recordsDeleted: 0,
      recordsFailed: errors.length,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      recordsCreated,
      recordsUpdated,
      recordsDeleted: 0,
      recordsFailed: 1,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Sync failed',
          code: 'SYNC_FAILED',
        },
      ],
    };
  }
}

// Sync leads to HubSpot
export async function syncLeadsToHubSpot(
  integrationId: string,
  workspaceId: string,
  fieldMappings: FieldMapping[],
  leadIds?: string[]
): Promise<SyncResult> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return {
      success: false,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsFailed: 0,
      errors: [{ message: 'No credentials found', code: 'NO_CREDENTIALS' }],
    };
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const errors: SyncError[] = [];

  try {
    // Get leads to sync
    let query = supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds);
    }

    const { data: leads } = await query;

    if (!leads || leads.length === 0) {
      return {
        success: true,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        recordsFailed: 0,
        errors: [],
      };
    }

    for (const lead of leads) {
      try {
        const contact = mapLeadToHubSpot(lead, fieldMappings);

        if (lead.external_id && lead.source === 'hubspot') {
          // Update existing HubSpot contact
          const result = await updateContact(credentials, lead.external_id, contact);
          if (result.success) {
            recordsUpdated++;
          } else {
            errors.push({
              recordId: lead.id,
              message: result.error || 'Update failed',
              code: 'UPDATE_FAILED',
            });
          }
        } else {
          // Create new HubSpot contact
          const result = await createContact(credentials, contact);
          if (result.success) {
            recordsCreated++;
            // Update lead with HubSpot ID
            await supabase
              .from('leads')
              .update({
                external_id: result.hubspotId,
                source: 'hubspot',
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);
          } else {
            errors.push({
              recordId: lead.id,
              message: result.error || 'Create failed',
              code: 'CREATE_FAILED',
            });
          }
        }
      } catch (error) {
        errors.push({
          recordId: lead.id,
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'SYNC_ERROR',
        });
      }
    }

    await updateLastSync(integrationId);

    return {
      success: errors.length === 0,
      recordsCreated,
      recordsUpdated,
      recordsDeleted: 0,
      recordsFailed: errors.length,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      recordsCreated,
      recordsUpdated,
      recordsDeleted: 0,
      recordsFailed: 1,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Sync failed',
          code: 'SYNC_FAILED',
        },
      ],
    };
  }
}

// Get HubSpot contact properties (for field mapping)
export async function getContactProperties(
  credentials: IntegrationCredentials
): Promise<Array<{ name: string; label: string; type: string }>> {
  const response = await fetch(
    `${HUBSPOT_API_BASE}/crm/v3/properties/contacts`,
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch HubSpot properties');
  }

  const data = await response.json();
  return data.results.map((prop: { name: string; label: string; type: string }) => ({
    name: prop.name,
    label: prop.label,
    type: prop.type,
  }));
}

// Helper: Map HubSpot contact to lead
function mapHubSpotToLead(
  contact: HubSpotContact,
  mappings: FieldMapping[]
): Record<string, unknown> {
  const lead: Record<string, unknown> = {
    email: contact.properties.email,
    first_name: contact.properties.firstname,
    last_name: contact.properties.lastname,
    company: contact.properties.company,
    phone: contact.properties.phone,
    title: contact.properties.jobtitle,
  };

  // Apply custom mappings
  for (const mapping of mappings) {
    const sourceValue = contact.properties[mapping.sourceField];
    if (sourceValue !== undefined) {
      lead[mapping.targetField] = applyTransform(sourceValue, mapping.transform);
    }
  }

  return lead;
}

// Helper: Map lead to HubSpot contact
function mapLeadToHubSpot(
  lead: Record<string, unknown>,
  mappings: FieldMapping[]
): CRMContact {
  const contact: CRMContact = {
    id: lead.id as string,
    email: lead.email as string,
    firstName: lead.first_name as string | undefined,
    lastName: lead.last_name as string | undefined,
    company: lead.company as string | undefined,
    phone: lead.phone as string | undefined,
    title: lead.title as string | undefined,
    customFields: {},
  };

  // Apply custom mappings
  for (const mapping of mappings) {
    const sourceValue = lead[mapping.sourceField];
    if (sourceValue !== undefined) {
      contact.customFields![mapping.targetField] = applyTransform(
        sourceValue as string,
        mapping.transform
      );
    }
  }

  return contact;
}

// Helper: Apply field transform
function applyTransform(
  value: string,
  transform?: string
): string {
  if (!transform || transform === 'none') return value;

  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'trim':
      return value.trim();
    default:
      return value;
  }
}

// Subscribe to HubSpot webhook events
export async function subscribeToWebhook(
  credentials: IntegrationCredentials,
  appId: string,
  webhookUrl: string,
  eventTypes: string[]
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  // HubSpot requires app-level webhook subscriptions
  // This would be configured at the app level, not per integration
  // Returning placeholder implementation
  return {
    success: true,
    subscriptionId: 'hubspot-webhook',
  };
}

// Handle incoming HubSpot webhook
export async function handleWebhook(
  payload: Record<string, unknown>[],
  integrationId: string,
  workspaceId: string
): Promise<{ processed: number; errors: string[] }> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  let processed = 0;
  const errors: string[] = [];

  for (const event of payload) {
    try {
      const eventType = event.subscriptionType as string;
      const objectId = event.objectId as string;

      switch (eventType) {
        case 'contact.creation':
        case 'contact.propertyChange': {
          // Fetch updated contact and sync
          const credentials = await getIntegrationCredentials(integrationId);
          if (credentials) {
            const response = await fetch(
              `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${objectId}`,
              {
                headers: {
                  Authorization: `Bearer ${credentials.accessToken}`,
                },
              }
            );

            if (response.ok) {
              const contact = await response.json();
              const leadData = mapHubSpotToLead(contact, []);
              leadData.workspace_id = workspaceId;
              leadData.source = 'hubspot';
              leadData.external_id = objectId;

              await supabase
                .from('leads')
                .upsert(leadData, {
                  onConflict: 'workspace_id,email',
                });
              processed++;
            }
          }
          break;
        }

        case 'contact.deletion': {
          // Mark lead as deleted
          await supabase
            .from('leads')
            .update({
              status: 'deleted',
              updated_at: new Date().toISOString(),
            })
            .eq('external_id', objectId)
            .eq('workspace_id', workspaceId);
          processed++;
          break;
        }

        default:
          console.log(`Unhandled HubSpot event: ${eventType}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return { processed, errors };
}
