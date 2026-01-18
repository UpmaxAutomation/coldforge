// Name Generation Utilities
// Generates realistic names, email addresses, and aliases for mailbox provisioning

import { createClient } from '../supabase/server';

export interface GeneratedIdentity {
  firstName: string;
  lastName: string;
  displayName: string;
  emailPrefix: string;
  emailVariants: string[];
}

export interface NameGeneratorOptions {
  workspaceId?: string;
  gender?: 'male' | 'female' | 'neutral';
  region?: 'us' | 'uk' | 'generic';
  style?: 'professional' | 'casual';
  count?: number;
}

// Email prefix patterns
const EMAIL_PATTERNS = [
  (first: string, last: string) => `${first}.${last}`,
  (first: string, last: string) => `${first}${last}`,
  (first: string, last: string) => `${first.charAt(0)}${last}`,
  (first: string, last: string) => `${first}${last.charAt(0)}`,
  (first: string, last: string) => `${first.charAt(0)}.${last}`,
  (first: string, last: string) => `${first}_${last}`,
  (first: string, last: string) => `${last}.${first}`,
  (first: string, last: string) => `${last}${first.charAt(0)}`,
];

// Fallback names if database is empty
const FALLBACK_FIRST_NAMES = {
  male: ['James', 'Michael', 'Robert', 'David', 'John', 'William', 'Richard', 'Joseph', 'Thomas', 'Christopher'],
  female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen'],
  neutral: ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Cameron', 'Drew'],
};

const FALLBACK_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
];

// Get names from database
async function getNamesFromDatabase(
  patternType: 'first_name' | 'last_name',
  options: NameGeneratorOptions
): Promise<string[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('name_patterns')
      .select('value, frequency_score')
      .eq('pattern_type', patternType)
      .eq('is_active', true);

    if (options.gender && options.gender !== 'neutral') {
      query = query.or(`gender.eq.${options.gender},gender.eq.neutral`);
    }

    if (options.region) {
      query = query.or(`region.eq.${options.region},region.eq.generic`);
    }

    query = query.order('frequency_score', { ascending: false });

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return [];
    }

    // Weight by frequency score for realistic distribution
    const weightedNames: string[] = [];
    for (const item of data) {
      const weight = item.frequency_score || 5;
      for (let i = 0; i < weight; i++) {
        weightedNames.push(item.value);
      }
    }

    return weightedNames;
  } catch {
    return [];
  }
}

// Get random item from array
function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Get random items from array (unique)
function getRandomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Generate a single identity
export async function generateIdentity(
  options: NameGeneratorOptions = {}
): Promise<GeneratedIdentity> {
  const gender = options.gender || getRandomItem(['male', 'female', 'neutral'] as const);

  // Try to get names from database
  let firstNames = await getNamesFromDatabase('first_name', { ...options, gender });
  let lastNames = await getNamesFromDatabase('last_name', options);

  // Fallback to hardcoded names
  if (firstNames.length === 0) {
    firstNames = FALLBACK_FIRST_NAMES[gender] || FALLBACK_FIRST_NAMES.neutral;
  }
  if (lastNames.length === 0) {
    lastNames = FALLBACK_LAST_NAMES;
  }

  const firstName = getRandomItem(firstNames);
  const lastName = getRandomItem(lastNames);

  // Generate email prefix variants
  const emailVariants = EMAIL_PATTERNS.map(pattern =>
    pattern(firstName.toLowerCase(), lastName.toLowerCase())
  );

  // Pick primary email pattern
  const emailPrefix = emailVariants[0];

  return {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    emailPrefix,
    emailVariants,
  };
}

// Generate multiple unique identities
export async function generateIdentities(
  count: number,
  options: NameGeneratorOptions = {}
): Promise<GeneratedIdentity[]> {
  const identities: GeneratedIdentity[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let identity: GeneratedIdentity;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      identity = await generateIdentity(options);
      attempts++;
    } while (usedNames.has(identity.displayName) && attempts < maxAttempts);

    usedNames.add(identity.displayName);
    identities.push(identity);
  }

  return identities;
}

// Generate email address
export function generateEmailAddress(
  identity: GeneratedIdentity,
  domain: string,
  variant: number = 0
): string {
  const prefix = identity.emailVariants[variant % identity.emailVariants.length];
  return `${prefix}@${domain}`;
}

// Generate aliases for an email
export async function generateAliases(
  identity: GeneratedIdentity,
  domain: string,
  count: number = 2,
  workspaceId?: string
): Promise<string[]> {
  const aliases: string[] = [];

  // Get alias patterns from database
  let prefixes: string[] = [];
  let suffixes: string[] = [];

  try {
    const supabase = await createClient();

    const [prefixData, suffixData] = await Promise.all([
      supabase
        .from('name_patterns')
        .select('value')
        .eq('pattern_type', 'alias_prefix')
        .eq('is_active', true)
        .or(workspaceId ? `workspace_id.is.null,workspace_id.eq.${workspaceId}` : 'workspace_id.is.null'),
      supabase
        .from('name_patterns')
        .select('value')
        .eq('pattern_type', 'alias_suffix')
        .eq('is_active', true)
        .or(workspaceId ? `workspace_id.is.null,workspace_id.eq.${workspaceId}` : 'workspace_id.is.null'),
    ]);

    prefixes = (prefixData.data || []).map(p => p.value);
    suffixes = (suffixData.data || []).map(s => s.value);
  } catch {
    // Fallback patterns
    prefixes = ['sales', 'info', 'contact', 'hello'];
    suffixes = ['.leads', '.biz', '.pro', '.work'];
  }

  // Generate aliases using different strategies
  const strategies = [
    // Use email variant
    () => identity.emailVariants[Math.floor(Math.random() * identity.emailVariants.length)],
    // Use prefix + name
    () => prefixes.length > 0
      ? `${getRandomItem(prefixes)}.${identity.firstName.toLowerCase()}`
      : `${identity.firstName.toLowerCase()}.${identity.lastName.toLowerCase().charAt(0)}`,
    // Use name + suffix
    () => suffixes.length > 0
      ? `${identity.firstName.toLowerCase()}${getRandomItem(suffixes)}`
      : `${identity.firstName.toLowerCase()}.${identity.lastName.toLowerCase()}`,
    // Initials + random number
    () => `${identity.firstName.charAt(0).toLowerCase()}${identity.lastName.charAt(0).toLowerCase()}${Math.floor(Math.random() * 100)}`,
  ];

  const usedAliases = new Set<string>();

  for (let i = 0; i < count; i++) {
    let alias: string;
    let attempts = 0;

    do {
      const strategy = strategies[i % strategies.length];
      alias = `${strategy()}@${domain}`;
      attempts++;
    } while (usedAliases.has(alias) && attempts < 5);

    if (!usedAliases.has(alias)) {
      usedAliases.add(alias);
      aliases.push(alias);
    }
  }

  return aliases;
}

// Generate a secure password
export function generateSecurePassword(length: number = 16): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = lowercase + uppercase + numbers + symbols;

  // Ensure at least one of each type
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Validate email address format
export function validateEmailAddress(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// Check if email already exists
export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('provisioned_mailboxes')
      .select('id')
      .eq('email_address', email)
      .single();

    return !error && !!data;
  } catch {
    return false;
  }
}

// Generate unique email that doesn't exist
export async function generateUniqueEmail(
  identity: GeneratedIdentity,
  domain: string
): Promise<string> {
  for (let variant = 0; variant < identity.emailVariants.length; variant++) {
    const email = generateEmailAddress(identity, domain, variant);
    const exists = await checkEmailExists(email);
    if (!exists) {
      return email;
    }
  }

  // If all variants exist, add a number
  let counter = 1;
  let email: string;
  do {
    email = `${identity.emailVariants[0]}${counter}@${domain}`;
    counter++;
  } while (await checkEmailExists(email) && counter < 100);

  return email;
}

// Update name usage statistics
export async function updateNameUsage(
  firstName: string,
  lastName: string
): Promise<void> {
  try {
    const supabase = await createClient();

    await Promise.all([
      supabase
        .from('name_patterns')
        .update({ times_used: supabase.rpc('increment', { x: 1 }) })
        .eq('pattern_type', 'first_name')
        .eq('value', firstName),
      supabase
        .from('name_patterns')
        .update({ times_used: supabase.rpc('increment', { x: 1 }) })
        .eq('pattern_type', 'last_name')
        .eq('value', lastName),
    ]);
  } catch {
    // Silently fail - usage stats are not critical
  }
}
