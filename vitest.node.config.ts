import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/App.ui.test.tsx'],
    exclude: [],
    environment: 'jsdom',
    testNamePattern: 'composePromptWithSelection'
  }
})
