# ADR-006: AES-256-CBC Credential Encryption

## Status
Accepted

## Context
InstantScale stores sensitive credentials:
- SMTP passwords for generic email accounts
- App passwords for Gmail/Microsoft accounts
- API keys for registrar integrations

These must be encrypted at rest to:
- Protect against database breaches
- Meet security compliance requirements
- Build user trust

## Decision
Encrypt all credentials using AES-256-CBC before database storage.

## Implementation

```typescript
// lib/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## Key Management

| Environment | Key Source |
|-------------|------------|
| Development | `.env.local` file |
| Production | Environment variable from secrets manager |

### Key Generation

```bash
# Generate a 256-bit key
openssl rand -hex 32
```

## Encrypted Fields

| Table | Field | Notes |
|-------|-------|-------|
| email_accounts | smtp_password | Generic SMTP |
| email_accounts | imap_password | Reply detection |
| email_accounts | refresh_token | OAuth tokens |
| registrar_credentials | api_key | Domain APIs |

## Consequences

### Positive
- **Security**: Database breach doesn't expose plaintext credentials
- **Compliance**: Meets encryption-at-rest requirements
- **Simplicity**: Symmetric encryption is fast

### Negative
- **Key management**: Key rotation requires re-encryption
- **Single point of failure**: Key loss = data loss
- **Performance**: Encryption/decryption overhead (minimal)

## Key Rotation (Future)

When implementing key rotation:

```typescript
// Store key version with encrypted data
const encrypted = `v1:${iv}:${ciphertext}`;

// During rotation
// 1. Decrypt with old key
// 2. Re-encrypt with new key
// 3. Update version prefix
```

## Security Considerations

1. **Key never in code**: Always from environment
2. **Unique IV per encryption**: Prevents pattern analysis
3. **Key logging disabled**: Redacted in all logs
4. **Access logging**: All decryption operations logged
