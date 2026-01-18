// Template Variable Processing

import { BUILT_IN_VARIABLES, type TemplateVariable } from './types'

interface LeadData {
  email: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  website?: string
  customFields?: Record<string, string>
}

interface SenderData {
  name: string
  email: string
  title?: string
  company?: string
  phone?: string
}

// Process template with variables
export function processTemplate(
  template: string,
  lead: LeadData,
  sender: SenderData,
  customVariables?: Record<string, string>
): string {
  let result = template

  // Lead variables
  result = result.replace(/\{\{firstName\}\}/gi, lead.firstName || '')
  result = result.replace(/\{\{lastName\}\}/gi, lead.lastName || '')
  result = result.replace(/\{\{fullName\}\}/gi,
    [lead.firstName, lead.lastName].filter(Boolean).join(' ') || '')
  result = result.replace(/\{\{email\}\}/gi, lead.email)
  result = result.replace(/\{\{title\}\}/gi, lead.title || '')
  result = result.replace(/\{\{phone\}\}/gi, lead.phone || '')
  result = result.replace(/\{\{company\}\}/gi, lead.company || '')
  result = result.replace(/\{\{website\}\}/gi, lead.website || '')

  // Sender variables
  result = result.replace(/\{\{senderName\}\}/gi, sender.name)
  result = result.replace(/\{\{senderEmail\}\}/gi, sender.email)
  result = result.replace(/\{\{senderTitle\}\}/gi, sender.title || '')
  result = result.replace(/\{\{senderCompany\}\}/gi, sender.company || '')
  result = result.replace(/\{\{senderPhone\}\}/gi, sender.phone || '')

  // Dynamic variables
  const now = new Date()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  result = result.replace(/\{\{day\}\}/gi, days[now.getDay()] ?? '')
  result = result.replace(/\{\{month\}\}/gi, months[now.getMonth()] ?? '')
  result = result.replace(/\{\{year\}\}/gi, now.getFullYear().toString())

  // Custom lead fields
  if (lead.customFields) {
    for (const [key, value] of Object.entries(lead.customFields)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi')
      result = result.replace(regex, value || '')
    }
  }

  // Additional custom variables
  if (customVariables) {
    for (const [key, value] of Object.entries(customVariables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi')
      result = result.replace(regex, value || '')
    }
  }

  return result
}

// Extract variables from template
export function extractVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g
  const matches = template.match(regex) || []
  return [...new Set(matches)]
}

// Validate template has required variables filled
export function validateTemplate(
  template: string,
  lead: LeadData,
  sender: SenderData
): { valid: boolean; missingVariables: string[] } {
  const variables = extractVariables(template)
  const missingVariables: string[] = []

  for (const variable of variables) {
    const key = variable.replace(/\{\{|\}\}/g, '').toLowerCase()

    // Check if variable has a value
    let hasValue = false

    switch (key) {
      case 'firstname':
        hasValue = !!lead.firstName
        break
      case 'lastname':
        hasValue = !!lead.lastName
        break
      case 'fullname':
        hasValue = !!(lead.firstName || lead.lastName)
        break
      case 'email':
        hasValue = !!lead.email
        break
      case 'title':
        hasValue = !!lead.title
        break
      case 'phone':
        hasValue = !!lead.phone
        break
      case 'company':
        hasValue = !!lead.company
        break
      case 'website':
        hasValue = !!lead.website
        break
      case 'sendername':
        hasValue = !!sender.name
        break
      case 'senderemail':
        hasValue = !!sender.email
        break
      case 'sendertitle':
        hasValue = !!sender.title
        break
      case 'sendercompany':
        hasValue = !!sender.company
        break
      case 'senderphone':
        hasValue = !!sender.phone
        break
      case 'day':
      case 'month':
      case 'year':
        hasValue = true // Dynamic variables always have values
        break
      default:
        // Check custom fields
        hasValue = !!(lead.customFields?.[key])
    }

    if (!hasValue) {
      missingVariables.push(variable)
    }
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables,
  }
}

// Get all available variables for a lead
export function getAvailableVariables(
  lead?: LeadData,
  customFieldKeys?: string[]
): TemplateVariable[] {
  const variables = [...BUILT_IN_VARIABLES]

  // Add custom field variables
  if (customFieldKeys) {
    for (const key of customFieldKeys) {
      variables.push({
        name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        key: `{{${key}}}`,
        description: `Custom field: ${key}`,
        example: lead?.customFields?.[key] || '',
        category: 'custom',
      })
    }
  }

  return variables
}

// Preview template with sample data
export function previewTemplate(
  template: string,
  sampleLead?: Partial<LeadData>,
  sampleSender?: Partial<SenderData>
): string {
  const lead: LeadData = {
    email: sampleLead?.email || 'john@example.com',
    firstName: sampleLead?.firstName || 'John',
    lastName: sampleLead?.lastName || 'Doe',
    company: sampleLead?.company || 'Acme Inc',
    title: sampleLead?.title || 'CEO',
    phone: sampleLead?.phone || '+1234567890',
    website: sampleLead?.website || 'acme.com',
    customFields: sampleLead?.customFields || {},
  }

  const sender: SenderData = {
    name: sampleSender?.name || 'Jane Smith',
    email: sampleSender?.email || 'jane@company.com',
    title: sampleSender?.title || 'Sales Representative',
    company: sampleSender?.company || 'My Company',
    phone: sampleSender?.phone || '+1987654321',
  }

  return processTemplate(template, lead, sender)
}

// ============================================
// SPINTAX VARIATION ENGINE
// Supports nested spintax: {Hi|Hello {friend|colleague}}
// ============================================

export interface SpintaxNode {
  type: 'text' | 'choice'
  value?: string
  options?: SpintaxNode[][]
}

export interface SpintaxAnalysis {
  totalVariations: number
  spintaxCount: number
  maxNestingDepth: number
  isValid: boolean
  errors: string[]
}

export interface SpintaxVariation {
  text: string
  index: number
  hash: string
}

/**
 * Parse spintax text into an AST for processing
 * Handles nested spintax like {Hi|Hello {friend|colleague}}
 */
export function parseSpintax(text: string): SpintaxNode[] {
  const nodes: SpintaxNode[] = []
  let i = 0

  while (i < text.length) {
    if (text[i] === '{') {
      // Find matching closing brace (accounting for nesting)
      let depth = 1
      let j = i + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        if (text[j] === '}') depth--
        j++
      }

      if (depth !== 0) {
        // Unmatched brace - treat as literal text
        nodes.push({ type: 'text', value: text[i] })
        i++
        continue
      }

      // Extract content between braces
      const content = text.slice(i + 1, j - 1)
      const options = splitSpintaxOptions(content)

      // Recursively parse each option
      const parsedOptions = options.map((opt) => parseSpintax(opt))
      nodes.push({ type: 'choice', options: parsedOptions })
      i = j
    } else {
      // Regular text - collect until we hit a brace
      let textEnd = i
      while (textEnd < text.length && text[textEnd] !== '{') {
        textEnd++
      }
      nodes.push({ type: 'text', value: text.slice(i, textEnd) })
      i = textEnd
    }
  }

  return nodes
}

/**
 * Split spintax options at the top level only (respecting nested braces)
 */
function splitSpintaxOptions(content: string): string[] {
  const options: string[] = []
  let current = ''
  let depth = 0

  for (const char of content) {
    if (char === '{') {
      depth++
      current += char
    } else if (char === '}') {
      depth--
      current += char
    } else if (char === '|' && depth === 0) {
      options.push(current)
      current = ''
    } else {
      current += char
    }
  }
  options.push(current)

  return options
}

/**
 * Process spintax with recursive nesting support
 * Uses optional seed for reproducible randomization
 */
export function processSpintax(text: string, seed?: number): string {
  const nodes = parseSpintax(text)
  const rng = seed !== undefined ? createSeededRandom(seed) : Math.random
  return renderNodes(nodes, rng)
}

/**
 * Render parsed spintax nodes to text
 */
function renderNodes(nodes: SpintaxNode[], rng: () => number): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return node.value ?? ''
      }
      if (node.type === 'choice' && node.options && node.options.length > 0) {
        const chosenIndex = Math.floor(rng() * node.options.length)
        const chosen = node.options[chosenIndex] ?? []
        return renderNodes(chosen, rng)
      }
      return ''
    })
    .join('')
}

/**
 * Create a seeded random number generator for reproducible results
 * Uses mulberry32 algorithm
 */
function createSeededRandom(seed: number): () => number {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Calculate the total number of unique variations possible
 */
export function countSpintaxVariations(text: string): number {
  const nodes = parseSpintax(text)
  return countNodeVariations(nodes)
}

function countNodeVariations(nodes: SpintaxNode[]): number {
  let total = 1

  for (const node of nodes) {
    if (node.type === 'choice' && node.options) {
      let optionSum = 0
      for (const option of node.options) {
        optionSum += countNodeVariations(option)
      }
      total *= optionSum
    }
  }

  return total
}

/**
 * Analyze spintax text for validation and statistics
 */
export function analyzeSpintax(text: string): SpintaxAnalysis {
  const errors: string[] = []
  let spintaxCount = 0
  let maxDepth = 0

  // Check for unmatched braces
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      depth++
      spintaxCount++
      maxDepth = Math.max(maxDepth, depth)
    }
    if (text[i] === '}') {
      depth--
      if (depth < 0) {
        errors.push(`Unmatched closing brace at position ${i}`)
        depth = 0
      }
    }
  }

  if (depth > 0) {
    errors.push(`${depth} unclosed opening brace(s)`)
  }

  // Check for empty options
  const emptyOptionRegex = /\{\||\|\}|\|\|/g
  if (emptyOptionRegex.test(text)) {
    errors.push('Empty spintax options detected (e.g., {|option} or {option|})')
  }

  const totalVariations = errors.length === 0 ? countSpintaxVariations(text) : 0

  return {
    totalVariations,
    spintaxCount,
    maxNestingDepth: maxDepth,
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Generate all possible spintax variations
 * Warning: Can be expensive for complex spintax - use limit parameter
 */
export function generateAllVariations(text: string, limit = 1000): SpintaxVariation[] {
  const nodes = parseSpintax(text)
  const variations: SpintaxVariation[] = []

  function* generateCombinations(
    nodeList: SpintaxNode[],
    nodeIndex: number,
    current: string
  ): Generator<string> {
    if (nodeIndex >= nodeList.length) {
      yield current
      return
    }

    const node = nodeList[nodeIndex]

    if (node?.type === 'text') {
      yield* generateCombinations(nodeList, nodeIndex + 1, current + (node.value ?? ''))
    } else if (node?.type === 'choice' && node.options) {
      for (const option of node.options) {
        // Recursively generate all combinations for this option
        for (const optionResult of generateCombinations(option, 0, '')) {
          yield* generateCombinations(nodeList, nodeIndex + 1, current + optionResult)
        }
      }
    }
  }

  let index = 0
  for (const text of generateCombinations(nodes, 0, '')) {
    if (index >= limit) break
    variations.push({
      text,
      index,
      hash: simpleHash(text),
    })
    index++
  }

  return variations
}

/**
 * Simple hash function for variation uniqueness checking
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Generate a unique variation for a specific recipient
 * Ensures no two recipients with different seeds get the same text
 */
export function generateUniqueVariation(
  text: string,
  recipientId: string,
  campaignId: string
): string {
  // Create a deterministic seed from recipient and campaign IDs
  const seedString = `${campaignId}-${recipientId}`
  let seed = 0
  for (let i = 0; i < seedString.length; i++) {
    seed = ((seed << 5) - seed) + seedString.charCodeAt(i)
    seed = seed & seed
  }
  return processSpintax(text, Math.abs(seed))
}

/**
 * Check if a set of variations covers enough uniqueness
 * Returns statistics about variation distribution
 */
export function checkVariationUniqueness(
  text: string,
  recipientCount: number
): {
  totalVariations: number
  recipientCount: number
  coverageRatio: number
  isAdequate: boolean
  recommendation: string
} {
  const totalVariations = countSpintaxVariations(text)
  const coverageRatio = totalVariations / recipientCount

  let recommendation = ''
  let isAdequate = true

  if (coverageRatio < 1) {
    isAdequate = false
    recommendation = `Only ${totalVariations} unique variations for ${recipientCount} recipients. Add more spintax options to ensure uniqueness.`
  } else if (coverageRatio < 2) {
    recommendation = `${totalVariations} variations for ${recipientCount} recipients provides minimal coverage. Consider adding more options for better deliverability.`
  } else if (coverageRatio < 5) {
    recommendation = `Good variation coverage (${totalVariations} variations for ${recipientCount} recipients).`
  } else {
    recommendation = `Excellent variation coverage (${totalVariations} variations for ${recipientCount} recipients).`
  }

  return {
    totalVariations,
    recipientCount,
    coverageRatio,
    isAdequate,
    recommendation,
  }
}

/**
 * Preview multiple random spintax variations
 */
export function previewSpintaxVariations(text: string, count = 5): string[] {
  const variations: string[] = []
  const seen = new Set<string>()
  const maxAttempts = count * 10
  let attempts = 0

  while (variations.length < count && attempts < maxAttempts) {
    const variation = processSpintax(text)
    if (!seen.has(variation)) {
      seen.add(variation)
      variations.push(variation)
    }
    attempts++
  }

  return variations
}

// Generate unique subject line with spintax and variables
export function generateSubjectLine(
  subject: string,
  lead: LeadData,
  sender: SenderData,
  seed?: number
): string {
  // First process spintax (with optional seed for reproducibility)
  let result = processSpintax(subject, seed)

  // Then process variables
  result = processTemplate(result, lead, sender)

  return result
}

/**
 * Generate unique email content with both subject and body variations
 * Ensures the same lead always gets the same variation for a campaign
 */
export function generateUniqueEmailContent(
  subject: string,
  body: string,
  lead: LeadData,
  sender: SenderData,
  campaignId: string
): { subject: string; body: string } {
  // Create deterministic seed from lead email and campaign
  const seedString = `${campaignId}-${lead.email}`
  let seed = 0
  for (let i = 0; i < seedString.length; i++) {
    seed = ((seed << 5) - seed) + seedString.charCodeAt(i)
    seed = seed & seed
  }
  seed = Math.abs(seed)

  // Process subject with spintax then variables
  let processedSubject = processSpintax(subject, seed)
  processedSubject = processTemplate(processedSubject, lead, sender)

  // Process body with spintax then variables (use different part of seed)
  let processedBody = processSpintax(body, seed + 1)
  processedBody = processTemplate(processedBody, lead, sender)

  return {
    subject: processedSubject,
    body: processedBody,
  }
}

/**
 * Validate and analyze email content before sending
 * Checks both spintax validity and variable availability
 */
export function validateEmailContent(
  subject: string,
  body: string,
  lead: LeadData,
  sender: SenderData,
  recipientCount?: number
): {
  isValid: boolean
  errors: string[]
  warnings: string[]
  subjectAnalysis: SpintaxAnalysis
  bodyAnalysis: SpintaxAnalysis
  variableValidation: { valid: boolean; missingVariables: string[] }
  uniquenessCheck?: ReturnType<typeof checkVariationUniqueness>
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Analyze spintax in subject and body
  const subjectAnalysis = analyzeSpintax(subject)
  const bodyAnalysis = analyzeSpintax(body)

  if (!subjectAnalysis.isValid) {
    errors.push(`Subject spintax errors: ${subjectAnalysis.errors.join(', ')}`)
  }
  if (!bodyAnalysis.isValid) {
    errors.push(`Body spintax errors: ${bodyAnalysis.errors.join(', ')}`)
  }

  // Validate template variables
  const combinedTemplate = `${subject} ${body}`
  const variableValidation = validateTemplate(combinedTemplate, lead, sender)

  if (!variableValidation.valid) {
    warnings.push(`Missing variables: ${variableValidation.missingVariables.join(', ')}`)
  }

  // Check uniqueness coverage if recipient count provided
  let uniquenessCheck
  if (recipientCount && recipientCount > 0) {
    const totalVariations = subjectAnalysis.totalVariations * bodyAnalysis.totalVariations
    uniquenessCheck = {
      totalVariations,
      recipientCount,
      coverageRatio: totalVariations / recipientCount,
      isAdequate: totalVariations >= recipientCount,
      recommendation:
        totalVariations < recipientCount
          ? `Only ${totalVariations} unique email combinations for ${recipientCount} recipients. Add more spintax for better deliverability.`
          : `${totalVariations} unique combinations for ${recipientCount} recipients - good coverage.`,
    }

    if (!uniquenessCheck.isAdequate) {
      warnings.push(uniquenessCheck.recommendation)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    subjectAnalysis,
    bodyAnalysis,
    variableValidation,
    uniquenessCheck,
  }
}
