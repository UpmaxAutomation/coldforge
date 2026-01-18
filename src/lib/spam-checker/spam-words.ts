export const SPAM_TRIGGERS = {
  // High risk (deduct 15 points each)
  critical: [
    'free', 'guarantee', 'winner', 'congratulations', 'act now',
    'limited time', 'urgent', 'immediate', 'expire', 'offer expires',
    'click here', 'click below', 'buy now', 'order now', 'sign up free',
    'no obligation', 'no cost', 'risk free', 'no strings attached',
    'double your', 'earn extra', 'make money', 'extra income',
    'credit card required', 'no credit check', 'earn $', 'make $',
    'million dollars', 'billion dollar', 'cash bonus', 'free money',
    'work from home', 'be your own boss', 'financial freedom',
    'once in a lifetime', 'time sensitive', 'act immediately',
    'exclusive deal', 'special offer', 'unbelievable', 'miracle',
    'weight loss', 'lose weight', 'diet pills', 'burn fat',
    'increase your', 'double your income', 'triple your',
    'click now', 'order today', 'call now', 'apply now',
    'open immediately', 'urgent response needed', 'action required'
  ],

  // Medium risk (deduct 8 points each)
  warning: [
    'discount', 'deal', 'save', 'cheap', 'lowest price', 'best price',
    'special promotion', 'exclusive offer', 'limited offer', 'one time',
    'subscribe', 'unsubscribe', 'remove', 'opt-out', 'opt out',
    'click', 'download', 'access', 'claim', 'collect', 'get it now',
    'bonus', 'gift', 'prize', 'reward', 'cash', 'money back',
    'increase', 'maximize', 'opportunity', 'potential',
    'promotion', 'sale', 'clearance', 'bargain', 'affordable',
    'instant access', 'limited supply', 'hurry', 'don\'t miss',
    'reserve your', 'secure your', 'lock in', 'guarantee',
    'risk-free trial', 'no questions asked', 'satisfaction guaranteed',
    'call free', 'toll free', 'free quote', 'free consultation',
    'complimentary', 'at no cost', 'free gift', 'free sample',
    'trial offer', 'introductory offer', 'new customer', 'first time'
  ],

  // Low risk (deduct 3 points each)
  caution: [
    'opportunity', 'amazing', 'incredible', 'fantastic', 'wonderful',
    'solution', 'breakthrough', 'revolutionary', 'exclusive', 'secret',
    'proven', 'tested', 'results', 'success', 'performance',
    'lowest', 'highest', 'best', 'top', 'number one', '#1',
    'million', 'billion', 'thousand', 'percent', 'percentage',
    'guarantee', 'certified', 'authentic', 'genuine', 'real',
    'instantly', 'immediately', 'quickly', 'fast', 'rapid',
    'easy', 'simple', 'effortless', 'hassle-free', 'convenient',
    'exciting', 'great', 'perfect', 'ideal', 'ultimate',
    'transform', 'revolutionize', 'innovate', 'game-changer'
  ]
};

export const SPAM_PATTERNS = {
  // Regex patterns with their penalties
  allCaps: {
    pattern: /\b[A-Z]{4,}\b/g,
    penalty: 5,
    description: 'ALL CAPS words',
    suggestion: 'Avoid using all-caps words'
  },
  excessiveExclamation: {
    pattern: /!{2,}/g,
    penalty: 10,
    description: 'Multiple exclamation marks',
    suggestion: 'Use single exclamation marks sparingly'
  },
  excessiveQuestion: {
    pattern: /\?{2,}/g,
    penalty: 5,
    description: 'Multiple question marks',
    suggestion: 'Use single question marks'
  },
  dollarAmount: {
    pattern: /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
    penalty: 3,
    description: 'Dollar amounts',
    suggestion: 'Consider spelling out amounts or removing them'
  },
  percentOff: {
    pattern: /\d+%\s*off/gi,
    penalty: 8,
    description: 'Percentage discounts',
    suggestion: 'Avoid percentage discount language'
  },
  multipleLinks: {
    pattern: /https?:\/\//g,
    penalty: 10,
    description: 'Multiple links',
    suggestion: 'Use only one link maximum, preferably none in first email'
  },
  shortUrl: {
    pattern: /bit\.ly|goo\.gl|tinyurl|t\.co|ow\.ly|is\.gd|buff\.ly/gi,
    penalty: 15,
    description: 'URL shorteners',
    suggestion: 'Use full URLs instead of shortened links'
  },
  htmlInText: {
    pattern: /<[^>]+>/g,
    penalty: 5,
    description: 'HTML tags in plain text',
    suggestion: 'Remove HTML tags from plain text version'
  },
  excessiveSpaces: {
    pattern: /\s{3,}/g,
    penalty: 3,
    description: 'Excessive whitespace',
    suggestion: 'Clean up unnecessary whitespace'
  },
  repeatedWords: {
    pattern: /\b(\w+)\s+\1\b/gi,
    penalty: 3,
    description: 'Repeated consecutive words',
    suggestion: 'Remove duplicate words'
  },
  emailInSubject: {
    pattern: /@.*\.(com|net|org|io)/gi,
    penalty: 8,
    description: 'Email addresses in content',
    suggestion: 'Avoid including email addresses in the email body'
  },
  unicodeSymbols: {
    pattern: /[\u2600-\u26FF\u2700-\u27BF\u1F600-\u1F64F\u1F680-\u1F6FF]/g,
    penalty: 5,
    description: 'Emojis or special symbols',
    suggestion: 'Minimize emoji usage in cold emails'
  }
};

export interface SpamCheckResult {
  score: number;          // 0-100 (higher = better)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SpamIssue[];
  suggestions: string[];
  wordCount: number;
  linkCount: number;
  readableInSeconds: number;
  summary: string;
}

export interface SpamIssue {
  type: 'critical' | 'warning' | 'caution' | 'pattern';
  text: string;
  penalty: number;
  suggestion: string;
  position?: { start: number; end: number };
  count?: number;
}
