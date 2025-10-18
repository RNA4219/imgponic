import { describe, expect, it } from 'vitest'

import { sanitizeUserInput } from './sanitizeUserInput'

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

  it('keeps text untouched just below the limit', () => {
    const thresholdText = 'b'.repeat(40000)
    const result = sanitizeUserInput(thresholdText)
    expect(result.overLimit).toBe(false)
    expect(result.maskedTypes).toEqual([])
    expect(result.sanitized).toBe(thresholdText)
  })

  it('redacts secrets even when input exceeds the length limit', () => {
    const detectMaxLength = (): number => {
      let low = 0
      let high = 1
      while (!sanitizeUserInput('x'.repeat(high)).overLimit) {
        low = high
        high *= 2
      }
      while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2)
        if (sanitizeUserInput('x'.repeat(mid)).overLimit) {
          high = mid
        } else {
          low = mid
        }
      }
      return low
    }

    const MAX_LENGTH = detectMaxLength()
    const secret = "api-key: 'MySecretTokenABCDEFG123456'"
    const fillerLength = Math.max(0, MAX_LENGTH + 1 - secret.length)
    const longText = `${'x'.repeat(fillerLength)}${secret}`

    expect(longText.length).toBeGreaterThan(MAX_LENGTH)

    const result = sanitizeUserInput(longText)

    expect(result.overLimit).toBe(true)
    expect(result.sanitized).toContain('<REDACTED:API_KEY>')
    expect(result.sanitized).not.toContain('MySecretToken')
    expect(result.maskedTypes).toEqual(['API_KEY'])
  })
})
