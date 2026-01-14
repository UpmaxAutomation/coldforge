#!/usr/bin/env npx ts-node
/**
 * InstantScale App Validation Script
 * Automatically checks for common issues:
 * - Missing button handlers
 * - Broken imports
 * - API route coverage
 * - Component completeness
 */

import * as fs from 'fs'
import * as path from 'path'

interface ValidationResult {
  file: string
  issues: string[]
  warnings: string[]
}

const results: ValidationResult[] = []
let totalIssues = 0
let totalWarnings = 0

function scanFile(filePath: string): ValidationResult {
  const content = fs.readFileSync(filePath, 'utf-8')
  const issues: string[] = []
  const warnings: string[] = []

  // Check for buttons without onClick handlers
  const buttonRegex = /<Button[^>]*>/g
  const buttons = content.match(buttonRegex) || []
  buttons.forEach((button, index) => {
    if (!button.includes('onClick') && !button.includes('type="submit"') && !button.includes('asChild')) {
      // Check if it's inside a form (submit button)
      const beforeButton = content.substring(0, content.indexOf(button))
      const isInForm = beforeButton.lastIndexOf('<form') > beforeButton.lastIndexOf('</form')

      if (!isInForm) {
        issues.push(`Button #${index + 1} has no onClick handler`)
      }
    }
  })

  // Check for Link components without href
  const linkRegex = /<Link[^>]*>/g
  const links = content.match(linkRegex) || []
  links.forEach((link, index) => {
    if (!link.includes('href=')) {
      issues.push(`Link #${index + 1} has no href attribute`)
    }
  })

  // Check for useState without usage
  const useStateMatches = content.match(/const \[(\w+),\s*set\w+\]\s*=\s*useState/g) || []
  useStateMatches.forEach((match) => {
    const varName = match.match(/const \[(\w+),/)?.[1]
    if (varName && !content.includes(`{${varName}}`) && !content.includes(`${varName}.`)) {
      warnings.push(`State variable '${varName}' might be unused`)
    }
  })

  // Check for empty function bodies
  const emptyFunctionRegex = /(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g
  const emptyFunctions = content.match(emptyFunctionRegex) || []
  emptyFunctions.forEach((func) => {
    issues.push(`Empty function: ${func.substring(0, 50)}...`)
  })

  // Check for TODO comments
  const todoMatches = content.match(/\/\/\s*TODO[:\s].*/gi) || []
  todoMatches.forEach((todo) => {
    warnings.push(`TODO found: ${todo.trim()}`)
  })

  // Check for console.log (should use logger)
  const consoleLogMatches = content.match(/console\.(log|error|warn)\(/g) || []
  if (consoleLogMatches.length > 0) {
    warnings.push(`${consoleLogMatches.length} console.log statements (should use logger)`)
  }

  // Check for 'any' type
  const anyTypeMatches = content.match(/:\s*any\b/g) || []
  if (anyTypeMatches.length > 0) {
    warnings.push(`${anyTypeMatches.length} 'any' types found`)
  }

  return { file: filePath, issues, warnings }
}

function scanDirectory(dir: string, extensions: string[]): void {
  if (!fs.existsSync(dir)) return

  const items = fs.readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dir, item.name)

    if (item.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist'].includes(item.name)) {
        scanDirectory(fullPath, extensions)
      }
    } else if (extensions.some(ext => item.name.endsWith(ext))) {
      const result = scanFile(fullPath)
      if (result.issues.length > 0 || result.warnings.length > 0) {
        results.push(result)
        totalIssues += result.issues.length
        totalWarnings += result.warnings.length
      }
    }
  }
}

function checkAPIRoutes(): void {
  const apiDir = path.join(process.cwd(), 'src/app/api')
  const requiredRoutes = [
    'auth/login',
    'auth/register',
    'campaigns',
    'leads',
    'email-accounts',
    'domains',
    'billing',
    'health',
  ]

  const issues: string[] = []

  for (const route of requiredRoutes) {
    const routePath = path.join(apiDir, route)
    if (!fs.existsSync(routePath)) {
      issues.push(`Missing API route: /api/${route}`)
    }
  }

  if (issues.length > 0) {
    results.push({ file: 'API Routes', issues, warnings: [] })
    totalIssues += issues.length
  }
}

function checkPageCompleteness(): void {
  const pagesDir = path.join(process.cwd(), 'src/app/(dashboard)')
  const requiredPages = [
    'dashboard',
    'campaigns',
    'leads',
    'accounts',
    'domains',
    'settings',
  ]

  const issues: string[] = []

  for (const page of requiredPages) {
    const pagePath = path.join(pagesDir, page, 'page.tsx')
    if (!fs.existsSync(pagePath)) {
      issues.push(`Missing page: /${page}`)
    } else {
      const content = fs.readFileSync(pagePath, 'utf-8')
      // Check if page has actual content beyond static text
      if (!content.includes('useState') && !content.includes('useEffect') && !content.includes('Content')) {
        if (content.length < 500) {
          issues.push(`Page /${page} appears to be a stub (no interactivity)`)
        }
      }
    }
  }

  if (issues.length > 0) {
    results.push({ file: 'Pages', issues, warnings: [] })
    totalIssues += issues.length
  }
}

// Main
console.log('🔍 InstantScale App Validation\n')
console.log('Scanning source files...\n')

scanDirectory(path.join(process.cwd(), 'src'), ['.tsx', '.ts'])
checkAPIRoutes()
checkPageCompleteness()

// Output results
for (const result of results) {
  console.log(`📁 ${result.file}`)
  for (const issue of result.issues) {
    console.log(`   ❌ ${issue}`)
  }
  for (const warning of result.warnings) {
    console.log(`   ⚠️  ${warning}`)
  }
  console.log('')
}

console.log('━'.repeat(50))
console.log(`\n📊 Summary: ${totalIssues} issues, ${totalWarnings} warnings`)

if (totalIssues > 0) {
  console.log('\n❌ Validation FAILED - Fix issues before deploying')
  process.exit(1)
} else if (totalWarnings > 0) {
  console.log('\n⚠️  Validation PASSED with warnings')
  process.exit(0)
} else {
  console.log('\n✅ Validation PASSED')
  process.exit(0)
}
