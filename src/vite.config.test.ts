import { describe, expect, it } from 'vitest'

const toConfigObject = (config: unknown) => {
  if (typeof config === 'function') {
    return config({ command: 'build', mode: 'test' }, {} as never)
  }

  return config
}

describe('vite.config', () => {
  it('react プラグインを組み込む', async () => {
    const module = await import('../vite.config')
    const rawConfig = toConfigObject(module.default)

    const plugins = Array.isArray((rawConfig as { plugins?: unknown }).plugins)
      ? ((rawConfig as { plugins?: unknown[] }).plugins ?? [])
      : []

    const pluginNames = plugins
      .flatMap((plugin) => {
        if (!plugin) {
          return []
        }

        if (Array.isArray(plugin)) {
          return plugin
        }

        return [plugin]
      })
      .map((plugin) => (typeof plugin === 'object' && plugin !== null ? (plugin as { name?: string }).name ?? '' : ''))

    expect(pluginNames.some((name) => name?.startsWith('vite:react'))).toBe(true)
  })
})
