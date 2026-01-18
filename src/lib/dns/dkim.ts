// DKIM Key Generation and DNS Record Management
// Generates RSA key pairs and creates DNS records for email signing

import crypto from 'crypto';
import { getCloudflareClient } from '../cloudflare/client';
import { createClient } from '../supabase/server';
import { encrypt, decrypt } from '../encryption';

export interface DKIMKeyPair {
  privateKey: string;
  publicKey: string;
  selector: string;
  algorithm: 'rsa-sha256';
  keySize: number;
}

export interface DKIMRecord {
  selector: string;
  domain: string;
  dnsRecord: string;
  dnsName: string;
}

// Generate DKIM key pair
export function generateDKIMKeyPair(
  selector: string = 'coldforge',
  keySize: 2048 | 4096 = 2048
): DKIMKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return {
    privateKey,
    publicKey,
    selector,
    algorithm: 'rsa-sha256',
    keySize,
  };
}

// Extract public key for DNS record (removes headers/footers and newlines)
export function extractPublicKeyForDNS(publicKeyPEM: string): string {
  return publicKeyPEM
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '')
    .trim();
}

// Generate DKIM DNS record value
export function generateDKIMDNSRecord(publicKeyPEM: string): string {
  const publicKeyBase64 = extractPublicKeyForDNS(publicKeyPEM);

  // DKIM DNS record format
  return `v=DKIM1; k=rsa; p=${publicKeyBase64}`;
}

// Generate full DKIM setup
export function generateDKIMSetup(
  domain: string,
  selector: string = 'coldforge',
  keySize: 2048 | 4096 = 2048
): {
  keyPair: DKIMKeyPair;
  dnsRecord: DKIMRecord;
} {
  const keyPair = generateDKIMKeyPair(selector, keySize);
  const dnsValue = generateDKIMDNSRecord(keyPair.publicKey);
  const dnsName = `${selector}._domainkey.${domain}`;

  return {
    keyPair,
    dnsRecord: {
      selector,
      domain,
      dnsRecord: dnsValue,
      dnsName,
    },
  };
}

// Validate DKIM record
export function validateDKIMRecord(record: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must contain version
  if (!record.includes('v=DKIM1')) {
    errors.push('DKIM record must contain v=DKIM1');
  }

  // Must contain key type
  if (!record.includes('k=rsa')) {
    errors.push('DKIM record must contain k=rsa');
  }

  // Must contain public key
  if (!record.includes('p=')) {
    errors.push('DKIM record must contain public key (p=)');
  }

  // Check key length (approximate)
  const keyMatch = record.match(/p=([A-Za-z0-9+/=]+)/);
  if (keyMatch) {
    const keyLength = keyMatch[1].length;
    if (keyLength < 350) {
      warnings.push('DKIM key appears to be less than 2048 bits. Consider using a longer key.');
    }
  }

  // Check for testing mode
  if (record.includes('t=y')) {
    warnings.push('DKIM is in testing mode (t=y). Remove for production.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Create DKIM record in Cloudflare and store in database
export async function createDKIMRecord(
  domainId: string,
  zoneId: string,
  domain: string,
  selector: string = 'coldforge'
): Promise<{
  success: boolean;
  selector?: string;
  dnsName?: string;
  recordId?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const cloudflare = getCloudflareClient();

    // Generate DKIM keys
    const { keyPair, dnsRecord } = generateDKIMSetup(domain, selector);

    // Validate
    const validation = validateDKIMRecord(dnsRecord.dnsRecord);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    // Check if DKIM already exists for this selector
    const existingRecords = await cloudflare.listDNSRecords(zoneId, 'TXT');
    const existingDKIM = existingRecords.find(r =>
      r.name === dnsRecord.dnsName
    );

    let cloudflareRecordId: string;

    if (existingDKIM?.id) {
      // Update existing
      await cloudflare.updateDNSRecord(zoneId, existingDKIM.id, {
        content: dnsRecord.dnsRecord,
      });
      cloudflareRecordId = existingDKIM.id;
    } else {
      // Create new DNS record
      const response = await cloudflare.createDNSRecord(zoneId, {
        type: 'TXT',
        name: dnsRecord.dnsName,
        content: dnsRecord.dnsRecord,
        ttl: 3600,
      });
      cloudflareRecordId = response.result?.id || '';
    }

    // Store DNS record
    const { data: dnsRecordData } = await supabase
      .from('domain_dns_records')
      .upsert({
        domain_id: domainId,
        record_type: 'DKIM',
        record_name: dnsRecord.dnsName,
        record_value: dnsRecord.dnsRecord,
        cloudflare_record_id: cloudflareRecordId,
        verified: false,
      }, {
        onConflict: 'domain_id,record_type,record_name',
      })
      .select()
      .single();

    // Encrypt and store private key
    const encryptedPrivateKey = encrypt(keyPair.privateKey);

    await supabase.from('dkim_keys').upsert({
      domain_id: domainId,
      selector: keyPair.selector,
      private_key_encrypted: encryptedPrivateKey,
      public_key: keyPair.publicKey,
      algorithm: keyPair.algorithm,
      key_size: keyPair.keySize,
      dns_record_id: dnsRecordData?.id,
      active: true,
    }, {
      onConflict: 'domain_id,selector',
    });

    return {
      success: true,
      selector: keyPair.selector,
      dnsName: dnsRecord.dnsName,
      recordId: cloudflareRecordId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create DKIM record',
    };
  }
}

// Verify DKIM record propagation
export async function verifyDKIMRecord(
  domain: string,
  selector: string = 'coldforge'
): Promise<{
  verified: boolean;
  record?: string;
  error?: string;
}> {
  try {
    const dns = await import('dns').then(m => m.promises);
    const dkimDomain = `${selector}._domainkey.${domain}`;

    const records = await dns.resolveTxt(dkimDomain);
    const dkimRecord = records.flat().join('');

    if (!dkimRecord) {
      return {
        verified: false,
        error: 'No DKIM record found',
      };
    }

    const validation = validateDKIMRecord(dkimRecord);

    return {
      verified: validation.valid,
      record: dkimRecord,
      error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : 'DNS lookup failed',
    };
  }
}

// Get DKIM private key for signing (decrypted)
export async function getDKIMPrivateKey(
  domainId: string,
  selector: string = 'coldforge'
): Promise<string | null> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from('dkim_keys')
      .select('private_key_encrypted')
      .eq('domain_id', domainId)
      .eq('selector', selector)
      .eq('active', true)
      .single();

    if (!data?.private_key_encrypted) {
      return null;
    }

    return decrypt(data.private_key_encrypted);
  } catch {
    return null;
  }
}

// Rotate DKIM key (generate new, keep old for verification period)
export async function rotateDKIMKey(
  domainId: string,
  zoneId: string,
  domain: string,
  newSelector?: string
): Promise<{
  success: boolean;
  oldSelector?: string;
  newSelector?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Get current active key
    const { data: currentKey } = await supabase
      .from('dkim_keys')
      .select('selector')
      .eq('domain_id', domainId)
      .eq('active', true)
      .single();

    const oldSelector = currentKey?.selector || 'coldforge';

    // Generate new selector if not provided
    const selector = newSelector || `cf${Date.now().toString(36)}`;

    // Create new DKIM record
    const result = await createDKIMRecord(domainId, zoneId, domain, selector);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Mark old key as inactive (but don't delete for verification)
    await supabase
      .from('dkim_keys')
      .update({
        active: false,
        rotated_at: new Date().toISOString(),
      })
      .eq('domain_id', domainId)
      .eq('selector', oldSelector);

    return {
      success: true,
      oldSelector,
      newSelector: selector,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Key rotation failed',
    };
  }
}

// Sign email content with DKIM
export function signEmailWithDKIM(
  emailHeaders: string,
  emailBody: string,
  privateKey: string,
  domain: string,
  selector: string = 'coldforge'
): string {
  // Canonicalize body (simple canonicalization)
  const canonicalizedBody = emailBody.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').trim() + '\r\n';

  // Create body hash
  const bodyHash = crypto
    .createHash('sha256')
    .update(canonicalizedBody)
    .digest('base64');

  // Headers to sign (typical set)
  const headersToSign = ['from', 'to', 'subject', 'date', 'message-id'];

  // Create DKIM-Signature header
  const timestamp = Math.floor(Date.now() / 1000);
  const dkimHeader = [
    'v=1',
    'a=rsa-sha256',
    'c=relaxed/simple',
    `d=${domain}`,
    `s=${selector}`,
    `t=${timestamp}`,
    `bh=${bodyHash}`,
    `h=${headersToSign.join(':')}`,
    'b=', // Placeholder for signature
  ].join('; ');

  // Create signature
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(emailHeaders + '\r\nDKIM-Signature: ' + dkimHeader);
  const signature = sign.sign(privateKey, 'base64');

  return `DKIM-Signature: ${dkimHeader}${signature}`;
}
