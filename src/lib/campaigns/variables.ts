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

// Spintax processor for text variation
export function processSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g

  return text.replace(spintaxRegex, (_match, content) => {
    const options = content.split('|')
    return options[Math.floor(Math.random() * options.length)] ?? ''
  })
}

// Generate unique subject line with spintax and variables
export function generateSubjectLine(
  subject: string,
  lead: LeadData,
  sender: SenderData
): string {
  // First process spintax
  let result = processSpintax(subject)

  // Then process variables
  result = processTemplate(result, lead, sender)

  return result
}
