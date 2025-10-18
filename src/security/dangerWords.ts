const BASE_DANGER_WORDS = [
  'ignore previous',
  'forget previous',
  'disregard prior instructions',
  'override earlier directives'
] as const

export const DANGER_WORDS: ReadonlyArray<string> = BASE_DANGER_WORDS

export const containsDangerWord = (text: string): boolean => {
  if (!text) return false
  const normalized = text.toLowerCase()
  return DANGER_WORDS.some(phrase => normalized.includes(phrase))
}

export const findDangerWordMatches = (text: string): ReadonlyArray<string> => {
  if (!text) return []
  const normalized = text.toLowerCase()
  return DANGER_WORDS.filter(phrase => normalized.includes(phrase))
}
