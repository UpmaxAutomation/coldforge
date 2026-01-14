// AI-powered spam score prediction

export interface SpamAnalysisResult {
  score: number // 0-100, lower is better
  issues: string[]
  suggestions: string[]
}

export function analyzeContent(subject: string, body: string): SpamAnalysisResult {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 0

  // Check for spam triggers
  const spamWords = ['free', 'urgent', 'act now', 'limited time', 'winner', 'congratulations']
  const lowerBody = body.toLowerCase()
  const lowerSubject = subject.toLowerCase()

  for (const word of spamWords) {
    if (lowerBody.includes(word) || lowerSubject.includes(word)) {
      issues.push(`Contains spam trigger word: "${word}"`)
      score += 10
    }
  }

  // Check caps
  const capsRatio = (body.match(/[A-Z]/g) || []).length / body.length
  if (capsRatio > 0.3) {
    issues.push('Too many capital letters')
    score += 15
  }

  // Check links
  const linkCount = (body.match(/https?:\/\//g) || []).length
  if (linkCount > 3) {
    issues.push('Too many links')
    score += 10
  }

  // Suggestions
  if (score > 30) suggestions.push('Consider rewriting to avoid spam triggers')
  if (linkCount > 2) suggestions.push('Reduce number of links')

  return { score: Math.min(100, score), issues, suggestions }
}
