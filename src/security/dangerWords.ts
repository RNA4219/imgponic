const BASE_DANGER_WORDS = [
  'ignore previous',
  'disregard earlier instructions',
  'overrule safeguards'
] as const

export const DANGER_WORDS: ReadonlyArray<string> = BASE_DANGER_WORDS

export const containsDangerWords = (input: string): boolean => {
  if (!input) return false
  const normalized = input.toLowerCase()
  return DANGER_WORDS.some(word => normalized.includes(word))
}
