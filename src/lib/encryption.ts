import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is required')
  }
  // Use a fixed salt for consistent key derivation
  const salt = process.env.ENCRYPTION_SALT || 'instantscale-default-salt'
  return scryptSync(secret, salt, KEY_LENGTH)
}

export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedData: string): string {
  const key = getKey()
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':')

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted data format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

export function encryptObject<T extends object>(obj: T): string {
  return encrypt(JSON.stringify(obj))
}

export function decryptObject<T extends object>(encryptedData: string): T {
  const decrypted = decrypt(encryptedData)
  return JSON.parse(decrypted) as T
}

// Helper to check if a string is encrypted (has the expected format)
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 &&
         parts[0].length === IV_LENGTH * 2 &&
         parts[1].length === AUTH_TAG_LENGTH * 2
}
