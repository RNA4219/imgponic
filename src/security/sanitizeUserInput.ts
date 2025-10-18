export type SanitizedUserInput = {
  sanitized: string
  maskedTypes: string[]
  overLimit: boolean
}

const MAX_LENGTH = 40000

type MaskPattern = { type: SanitizedType; regex: RegExp }
type SanitizedType = 'API_KEY' | 'PEM_KEY' | 'GOOGLE_API_KEY' | 'AWS_ACCESS_KEY' | 'AWS_SECRET_KEY'

const MASK_PATTERNS: readonly MaskPattern[] = [
  {
    type: 'API_KEY',
    regex: /(?:api[_-]?key|token|secret)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}['\"]?/gi
  },
  {
    type: 'PEM_KEY',
    regex: /-----BEGIN (?:RSA|EC|PRIVATE) KEY-----[\s\S]+?-----END (?:RSA|EC|PRIVATE) KEY-----/g
  },
  {
    type: 'GOOGLE_API_KEY',
    regex: /(AIza[0-9A-Za-z\-_]{35})/g
  },
  {
    type: 'AWS_ACCESS_KEY',
    regex: /(AKIA|ASIA)[0-9A-Z]{16}/g
  },
  {
    type: 'AWS_SECRET_KEY',
    regex: /aws(.{0,20})?(secret|access).{0,20}?([A-Za-z0-9/+=]{40})/gi
  }
]

export const sanitizeUserInput = (text: string): SanitizedUserInput => {
  if (!text) {
    return { sanitized: '', maskedTypes: [], overLimit: false }
  }

  const overLimit = text.length > MAX_LENGTH
  if (overLimit) {
    return { sanitized: text, maskedTypes: [], overLimit }
  }

  let sanitized = text
  const maskedTypes = new Set<SanitizedType>()

  for (const { type, regex } of MASK_PATTERNS) {
    sanitized = sanitized.replace(regex, () => {
      maskedTypes.add(type)
      return `<REDACTED:${type}>`
    })
  }

  return { sanitized, maskedTypes: Array.from(maskedTypes), overLimit }
}
