// Google Sheets Integration - Import/Export Leads
import type {
  IntegrationCredentials,
  FieldMapping,
  SyncResult,
  SyncError,
} from '../types';
import { getIntegrationCredentials, updateLastSync } from '../manager';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetData {
  range: string;
  majorDimension: 'ROWS' | 'COLUMNS';
  values: (string | number | null)[][];
}

interface Spreadsheet {
  spreadsheetId: string;
  properties: {
    title: string;
  };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties: {
        rowCount: number;
        columnCount: number;
      };
    };
  }>;
}

// Get spreadsheet metadata
export async function getSpreadsheet(
  credentials: IntegrationCredentials,
  spreadsheetId: string
): Promise<Spreadsheet> {
  const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}`, {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to get spreadsheet');
  }

  return response.json();
}

// Read data from a sheet
export async function readSheetData(
  credentials: IntegrationCredentials,
  spreadsheetId: string,
  range: string
): Promise<SheetData> {
  const response = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to read sheet data');
  }

  return response.json();
}

// Write data to a sheet
export async function writeSheetData(
  credentials: IntegrationCredentials,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
  options: {
    valueInputOption?: 'RAW' | 'USER_ENTERED';
    insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS';
  } = {}
): Promise<{ updatedCells: number; updatedRows: number }> {
  const { valueInputOption = 'USER_ENTERED', insertDataOption = 'OVERWRITE' } =
    options;

  const response = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to write sheet data');
  }

  const result = await response.json();
  return {
    updatedCells: result.updates?.updatedCells || 0,
    updatedRows: result.updates?.updatedRows || 0,
  };
}

// Clear a range in the sheet
export async function clearSheetRange(
  credentials: IntegrationCredentials,
  spreadsheetId: string,
  range: string
): Promise<void> {
  const response = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to clear range');
  }
}

// Create a new spreadsheet
export async function createSpreadsheet(
  credentials: IntegrationCredentials,
  title: string,
  sheetTitles: string[] = ['Sheet1']
): Promise<string> {
  const response = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetTitles.map((sheetTitle) => ({
        properties: { title: sheetTitle },
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create spreadsheet');
  }

  const result = await response.json();
  return result.spreadsheetId;
}

// Import leads from Google Sheet
export async function importLeadsFromSheet(
  integrationId: string,
  workspaceId: string,
  spreadsheetId: string,
  sheetName: string,
  fieldMappings: FieldMapping[],
  options: {
    startRow?: number;
    maxRows?: number;
    hasHeader?: boolean;
  } = {}
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

  const { startRow = 1, maxRows = 10000, hasHeader = true } = options;

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const errors: SyncError[] = [];

  try {
    // Read sheet data
    const range = `${sheetName}!A${startRow}:ZZ${startRow + maxRows}`;
    const sheetData = await readSheetData(credentials, spreadsheetId, range);

    if (!sheetData.values || sheetData.values.length === 0) {
      return {
        success: true,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        recordsFailed: 0,
        errors: [],
      };
    }

    const rows = sheetData.values;
    let headerRow: string[] = [];
    let dataStartIndex = 0;

    if (hasHeader) {
      headerRow = rows[0].map((h) => String(h || '').trim());
      dataStartIndex = 1;
    } else {
      // Use column letters as headers
      headerRow = rows[0].map((_, i) =>
        String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1)
      );
    }

    // Create column index map
    const columnMap = new Map<string, number>();
    headerRow.forEach((header, index) => {
      columnMap.set(header.toLowerCase(), index);
    });

    // Process each row
    for (let i = dataStartIndex; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = startRow + i;

      try {
        // Map fields from row
        const leadData: Record<string, unknown> = {
          workspace_id: workspaceId,
          source: 'google_sheets',
        };

        // Find email column (required)
        let email: string | undefined;

        for (const mapping of fieldMappings) {
          const colIndex = columnMap.get(mapping.sourceField.toLowerCase());
          if (colIndex !== undefined && row[colIndex] !== undefined) {
            const value = String(row[colIndex]);
            const transformedValue = applyTransform(value, mapping.transform);

            if (mapping.targetField === 'email') {
              email = transformedValue;
            }

            leadData[mapping.targetField] = transformedValue;
          }
        }

        // Try to find email if not mapped
        if (!email) {
          const emailColIndex =
            columnMap.get('email') ??
            columnMap.get('e-mail') ??
            columnMap.get('email address');
          if (emailColIndex !== undefined && row[emailColIndex]) {
            email = String(row[emailColIndex]).trim();
            leadData.email = email;
          }
        }

        if (!email) {
          errors.push({
            recordId: `row_${rowIndex}`,
            message: 'No email found in row',
            code: 'MISSING_EMAIL',
          });
          continue;
        }

        // Check if lead exists
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('email', email)
          .single();

        if (existingLead) {
          // Update existing using admin client
          await adminClient
            .from('leads')
            .update({
              ...leadData,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLead.id);
          recordsUpdated++;
        } else {
          // Create new using admin client to bypass RLS
          await adminClient.from('leads').insert(leadData);
          recordsCreated++;
        }
      } catch (error) {
        errors.push({
          recordId: `row_${rowIndex}`,
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'IMPORT_ERROR',
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
          message: error instanceof Error ? error.message : 'Import failed',
          code: 'IMPORT_FAILED',
        },
      ],
    };
  }
}

// Export leads to Google Sheet
export async function exportLeadsToSheet(
  integrationId: string,
  workspaceId: string,
  spreadsheetId: string,
  sheetName: string,
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

  const errors: SyncError[] = [];

  try {
    // Get leads to export
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

    // Build header row from field mappings
    const headers = fieldMappings.map((m) => m.sourceField);

    // Build data rows
    const dataRows = leads.map((lead) => {
      return fieldMappings.map((mapping) => {
        const value = lead[mapping.targetField];
        if (value === undefined || value === null) return '';
        return String(value);
      });
    });

    // Clear existing data
    await clearSheetRange(credentials, spreadsheetId, `${sheetName}!A:ZZ`);

    // Write header + data
    const allRows = [headers, ...dataRows];

    const result = await writeSheetData(
      credentials,
      spreadsheetId,
      `${sheetName}!A1`,
      allRows,
      { insertDataOption: 'OVERWRITE' }
    );

    await updateLastSync(integrationId);

    return {
      success: true,
      recordsCreated: result.updatedRows - 1, // Subtract header row
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsFailed: 0,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsFailed: 1,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Export failed',
          code: 'EXPORT_FAILED',
        },
      ],
    };
  }
}

// Get list of user's spreadsheets
export async function listSpreadsheets(
  credentials: IntegrationCredentials
): Promise<
  Array<{
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
  }>
> {
  // Use Drive API to list spreadsheets
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&fields=files(id%2Cname%2CcreatedTime%2CmodifiedTime)',
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to list spreadsheets');
  }

  const data = await response.json();

  return data.files.map(
    (file: {
      id: string;
      name: string;
      createdTime: string;
      modifiedTime: string;
    }) => ({
      id: file.id,
      name: file.name,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
    })
  );
}

// Get sheet names from spreadsheet
export async function getSheetNames(
  credentials: IntegrationCredentials,
  spreadsheetId: string
): Promise<string[]> {
  const spreadsheet = await getSpreadsheet(credentials, spreadsheetId);
  return spreadsheet.sheets.map((sheet) => sheet.properties.title);
}

// Helper: Apply field transform
function applyTransform(value: string, transform?: string): string {
  if (!transform || transform === 'none') return value;

  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'trim':
      return value.trim();
    case 'capitalize':
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    default:
      return value;
  }
}
