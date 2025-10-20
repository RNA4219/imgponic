import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  generateGtk4LinkReport,
  type GitLinkConfig,
  type RssLinkConfig
} from '../sunset/gtk4LinkMonitor'

const execFileAsync = promisify(execFile)

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'gtk4-monitor-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

const initGitRepo = async (dir: string, daysAgo: number) => {
  await execFileAsync('git', ['init', dir])
  await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'ci@example.com'])
  await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'CI'])
  const targetDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  const dateEnv = targetDate.toISOString()
  await writeFile(join(dir, 'README.md'), '# test\n', 'utf8')
  await execFileAsync('git', ['-C', dir, 'add', '.'])
  await execFileAsync('git', ['-C', dir, 'commit', '-m', 'init'], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: dateEnv,
      GIT_COMMITTER_DATE: dateEnv
    }
  })
}

describe('generateGtk4LinkReport', () => {
  test('ローカル mirror の最終コミット日時からステータスを判定する', async () => {
    const repoDir = join(workspace, 'repo')
    await mkdir(repoDir)
    await initGitRepo(repoDir, 5)

    const config: GitLinkConfig = {
      id: 'tauri-tao-pr-1104',
      url: 'https://github.com/tauri-apps/tao/pull/1104',
      type: 'git',
      repositoryPath: repoDir,
      branch: 'master',
      stalenessDays: 14
    }

    const report = await generateGtk4LinkReport({
      links: [config],
      now: new Date()
    })

    expect(report.entries[0].status).toBe('fresh')
    expect(report.entries[0].observedAt).toMatch(/^20\d{2}-/)
    expect(report.entries[0].evidence).toMatch(/commit/)
  })

  test('RSS アーカイブの最終更新日時が閾値を超えると stale を返す', async () => {
    const rssPath = join(workspace, 'feed.xml')
    const pastDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toUTCString()
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toUTCString()

    await writeFile(
      rssPath,
      `<rss><channel>
        <item><title>Older</title><pubDate>${pastDate}</pubDate></item>
        <item><title>Newer</title><pubDate>${recentDate}</pubDate></item>
      </channel></rss>`,
      'utf8'
    )

    const config: RssLinkConfig = {
      id: 'tauri-architecture-guide',
      url: 'https://v2.tauri.app/concept/architecture/',
      type: 'rss',
      feedPath: rssPath,
      stalenessDays: 7
    }

    const report = await generateGtk4LinkReport({
      links: [config],
      now: new Date()
    })

    expect(report.entries[0].status).toBe('stale')
    expect(report.entries[0].observedAt).toMatch(/^20\d{2}-/)
    expect(report.entries[0].evidence).toContain('Newer')
  })
})
