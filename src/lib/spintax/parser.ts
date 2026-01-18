/**
 * Spintax Parser - Generates unique email variations
 * Syntax: {option1|option2|option3}
 * Nested: {Hi|Hello {friend|colleague}}
 */

export interface SpintaxToken {
  type: 'text' | 'spin';
  value: string;
  options?: SpintaxToken[][];
}

export interface SpintaxResult {
  text: string;
  hash: string;
  variationIndex: number;
}

/**
 * Parse spintax string into tokens
 */
export function parseSpintax(input: string): SpintaxToken[] {
  const tokens: SpintaxToken[] = [];
  let current = 0;

  while (current < input.length) {
    if (input[current] === '{') {
      // Find matching closing brace (handle nesting)
      const closeIndex = findMatchingBrace(input, current);
      if (closeIndex === -1) {
        // No matching brace, treat as text
        tokens.push({ type: 'text', value: '{' });
        current++;
        continue;
      }

      const content = input.slice(current + 1, closeIndex);
      const options = splitOptions(content).map(opt => parseSpintax(opt));

      tokens.push({ type: 'spin', value: content, options });
      current = closeIndex + 1;
    } else {
      // Collect text until next { or end
      let textEnd = current;
      while (textEnd < input.length && input[textEnd] !== '{') {
        textEnd++;
      }

      if (textEnd > current) {
        tokens.push({ type: 'text', value: input.slice(current, textEnd) });
      }
      current = textEnd;
    }
  }

  return tokens;
}

/**
 * Find matching closing brace, handling nested braces
 */
function findMatchingBrace(input: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;

  while (i < input.length && depth > 0) {
    if (input[i] === '{') depth++;
    else if (input[i] === '}') depth--;
    i++;
  }

  return depth === 0 ? i - 1 : -1;
}

/**
 * Split options by | but respect nested braces
 */
function splitOptions(content: string): string[] {
  const options: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of content) {
    if (char === '{') {
      depth++;
      current += char;
    } else if (char === '}') {
      depth--;
      current += char;
    } else if (char === '|' && depth === 0) {
      options.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) options.push(current);
  return options;
}

/**
 * Validate spintax syntax
 */
export function validateSpintax(input: string): { valid: boolean; error?: string } {
  let depth = 0;
  let position = 0;

  for (const char of input) {
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth < 0) {
        return { valid: false, error: `Unexpected } at position ${position}` };
      }
    }
    position++;
  }

  if (depth !== 0) {
    return { valid: false, error: `Unclosed { brace (${depth} remaining)` };
  }

  return { valid: true };
}

/**
 * Extract all spintax blocks from text
 */
export function extractSpintaxBlocks(input: string): string[] {
  const blocks: string[] = [];
  const tokens = parseSpintax(input);

  function extractFromTokens(tokens: SpintaxToken[]): void {
    for (const token of tokens) {
      if (token.type === 'spin') {
        blocks.push(`{${token.value}}`);
        if (token.options) {
          for (const option of token.options) {
            extractFromTokens(option);
          }
        }
      }
    }
  }

  extractFromTokens(tokens);
  return blocks;
}
