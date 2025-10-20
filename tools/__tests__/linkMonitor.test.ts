import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'

import { collectLinkStatuses, type MonitorConfig } from '../sunset/linkMonitor'

const execFileAsync = promisify(execFile)

const setupDoc = async (content: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'link-monitor-'))
  const file = join(dir, 'links.md')
  await writeFile(file, content, 'utf8')
  return file
}

const setupGitRepo = async (isoDate: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'link-monitor-repo-'))
  await execFileAsync('git', ['init'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'tester'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# test\n', 'utf8')
  await execFileAsync('git', ['add', 'README.md'], { cwd: dir })
  await execFileAsync('git', ['commit', '-m', 'initial', '--date', isoDate], {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate }
  })
  return dir
}

const setupRss = async (isoDate: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'link-monitor-rss-'))
  const file = join(dir, 'feed.xml')
  const date = new Date(isoDate).toUTCString()
  await writeFile(file, `<rss><channel><item><title>x</title><pubDate>${date}</pubDate></item></channel></rss>`)
  return file
}

describe('collectLinkStatuses', () => {
  test('evaluates git and rss sources with freshness thresholds', async () => {
    const gitRepo = await setupGitRepo('2024-01-15T10:00:00Z')
    const rssFile = await setupRss('2024-01-10T12:00:00Z')
    const docPath = await setupDoc(
      `| リンク | 現状ステータス | 最終確認日 | 担当メモ |\n| --- | --- | --- | --- |\n| [git](https://example.com/git) | | | |\n| [rss](https://example.com/rss) | | | |\n| [unknown](https://example.com/unknown) | | | |`
    )
    const config: MonitorConfig = {
      linksFile: docPath,
      defaultFreshnessDays: 5,
      sources: {
        'https://example.com/git': { type: 'git', repoPath: gitRepo, freshnessDays: 10 },
        'https://example.com/rss': { type: 'rss', filePath: rssFile }
      }
    }

    const result = await collectLinkStatuses(config, { now: new Date('2024-01-20T00:00:00Z') })
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ link: 'https://example.com/git', status: 'fresh' })
    expect(result[1]).toMatchObject({ link: 'https://example.com/rss', status: 'stale' })
    expect(result[2]).toMatchObject({ link: 'https://example.com/unknown', status: 'unknown' })
    expect(result[1]?.updatedAt).toBe('2024-01-10T12:00:00.000Z')
  })

  test('returns missing when source evaluation fails', async () => {
    const docPath = await setupDoc(
      `| リンク | 現状ステータス | 最終確認日 | 担当メモ |\n| --- | --- | --- | --- |\n| [broken](https://example.com/broken) | | | |`
    )
    const config: MonitorConfig = {
      linksFile: docPath,
      sources: {
        'https://example.com/broken': { type: 'json', filePath: await setupDoc(''), field: 'updatedAt' }
      }
    }

    const [status] = await collectLinkStatuses(config)
    expect(status.status).toBe('missing')
    expect(status.details).toContain('JSON')
  })
})
