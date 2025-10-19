import { describe, expect, it } from 'vitest'

import { sanitizeUserInput } from './sanitizeUserInput'

const MAX_LENGTH = 40000

describe('sanitizeUserInput', () => {
  it('masks credentials according to appendix patterns', () => {
    const sample = [
      "api-key: 'MySecretTokenABCDEFG123456'",
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIICXAIBAAKBgQDX1',
      '-----END RSA PRIVATE KEY-----',
      `AIza${'A'.repeat(35)}`,
      'AKIA1234567890ABCDEF',
      'aws secret access key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    ].join('\n')

    const result = sanitizeUserInput(sample)

    expect(result.overLimit).toBe(false)
    expect(result.sanitized).toContain('<REDACTED:API_KEY>')
    expect(result.sanitized).toContain('<REDACTED:PEM_KEY>')
    expect(result.sanitized).toContain('<REDACTED:GOOGLE_API_KEY>')
    expect(result.sanitized).toContain('<REDACTED:AWS_ACCESS_KEY>')
    expect(result.sanitized).toContain('<REDACTED:AWS_SECRET_KEY>')
    expect(result.maskedTypes).toEqual([
      'API_KEY',
      'PEM_KEY',
      'GOOGLE_API_KEY',
      'AWS_ACCESS_KEY',
      'AWS_SECRET_KEY'
    ])
  })

  it('flags over-limit input without altering text', () => {
    const longText = 'a'.repeat(40001)
    const result = sanitizeUserInput(longText)
    expect(result.overLimit).toBe(true)
    expect(result.maskedTypes).toEqual([])
    expect(result.sanitized).toBe(longText)
  })

  it('masks secrets even when the input is over the limit', () => {
    const secret = 'AKIA1234567890ABCDEF'
    const longText = `${'x'.repeat(MAX_LENGTH)}${secret}`
    const result = sanitizeUserInput(longText)
    expect(result.overLimit).toBe(true)
    expect(result.sanitized).toMatch(/<REDACTED:[^>]+>/)
    expect(result.sanitized).not.toContain(secret)
    expect(result.maskedTypes).toEqual(['AWS_ACCESS_KEY'])
  })

  it('keeps text untouched just below the limit', () => {
    const thresholdText = 'b'.repeat(40000)
    const result = sanitizeUserInput(thresholdText)
    expect(result.overLimit).toBe(false)
    expect(result.maskedTypes).toEqual([])
    expect(result.sanitized).toBe(thresholdText)
  })
})
