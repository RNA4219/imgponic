/// <reference types="vitest" />

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync('src/app.css', 'utf8');

const tokens = [
  '--bg',
  '--ink',
  '--accent-50',
  '--accent-100',
  '--accent-200',
  '--accent-300',
  '--accent-400',
  '--accent-500',
  '--accent-600',
  '--border',
  '--panel',
  '--shadow',
];

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getBlock = (selector: string): string => {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[\\s\\S]*?\\}`, 'g');
  const match = css.match(pattern);
  return match?.join('\n') ?? '';
};

describe('theme tokens', () => {
  it('declares required CSS variables', () => {
    tokens.forEach((token) => {
      expect(css).toMatch(new RegExp(`${token}\\s*:`));
    });
  });

  const expectations: Record<string, string[]> = {
    body: ['var(--bg)', 'var(--ink)'],
    '.btn': ['var(--accent-600)', 'var(--accent-700)'],
    '.btn:hover': ['var(--accent-100)'],
    '.btn:active': ['var(--accent-200)'],
    '.btn.primary': ['var(--accent-400)', 'var(--accent-800)'],
    '.btn.primary:hover': ['var(--accent-300)'],
    '.btn.primary:active': ['var(--accent-500)'],
    'input[type="text"]': ['var(--accent-50)', 'var(--ink)'],
    'input[type="text"]:focus': ['var(--accent-600)'],
    '.panel': ['var(--panel)', 'var(--border)', 'var(--shadow)'],
  };

  describe('component styles', () => {
    Object.entries(expectations).forEach(([selector, required]) => {
      it(`${selector} uses theme tokens`, () => {
        const block = getBlock(selector);
        expect(block.length).toBeGreaterThan(0);
        required.forEach((reference) => {
          expect(block).toContain(reference);
        });
      });
    });
  });
});
