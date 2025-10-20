import { execFile } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
type LinkBase = { id: string; url: string; stalenessDays?: number }
export type GitLinkConfig = LinkBase & { type: 'git'; repositoryPath: string; branch?: string }
export type RssLinkConfig = LinkBase & { type: 'rss'; feedPath: string }
export type LinkConfig = GitLinkConfig | RssLinkConfig
export type LinkStatus = 'fresh' | 'stale' | 'missing_source' | 'error'
export type LinkReportEntry = { id: string; url: string; status: LinkStatus; observedAt: string | null; evidence: string; error?: string }
export type LinkReport = { generatedAt: string; entries: LinkReportEntry[] }
const DEFAULT_STALENESS_DAYS = 30

const gitObservation = async (config: GitLinkConfig) => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', config.repositoryPath, 'show', '--no-patch', '--format=%cI\n%H\n%s', config.branch ?? 'HEAD'])
    const [dateRaw, hash, subject] = stdout.trim().split('\n'), observedAt = new Date(dateRaw)
    if (Number.isNaN(observedAt.getTime())) throw new Error(`コミット日時を解析できません: ${dateRaw}`)
    return { observedAt, evidence: `commit ${hash.slice(0, 12)} — ${subject}` }
  } catch (error) {
    if ((error as { code?: number }).code === 128) return { observedAt: null, evidence: 'repository unavailable' }
    throw error
  }
}

const rssObservation = async (config: RssLinkConfig) => {
  try {
    const xml = await readFile(config.feedPath, 'utf8')
    const entries = [/<item[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<pubDate>([^<]+)<\/pubDate>[\s\S]*?<\/item>/gi,/<entry[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<updated>([^<]+)<\/updated>[\s\S]*?<\/entry>/gi]
      .flatMap((pattern) => Array.from(xml.matchAll(pattern)))
      .map((match) => ({ title: match[1].trim(), date: new Date(match[2].trim()) }))
      .filter((entry) => !Number.isNaN(entry.date.getTime()))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
    const latest = entries[0]
    return latest ? { observedAt: latest.date, evidence: `latest entry: ${latest.title} (${latest.date.toUTCString()})` } : { observedAt: null, evidence: 'no entries' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { observedAt: null, evidence: 'feed missing' }
    throw error
  }
}

const statusFrom = (observedAt: Date | null, stalenessDays: number, now: Date): LinkStatus =>
  !observedAt ? 'missing_source' : now.getTime() - observedAt.getTime() <= stalenessDays * 86_400_000 ? 'fresh' : 'stale'

const observe = async (link: LinkConfig, now: Date): Promise<LinkReportEntry> => {
  const stalenessDays = link.stalenessDays ?? DEFAULT_STALENESS_DAYS
  try {
    const { observedAt, evidence } = link.type === 'git' ? await gitObservation(link) : await rssObservation(link)
    return { id: link.id, url: link.url, status: statusFrom(observedAt, stalenessDays, now), observedAt: observedAt ? observedAt.toISOString() : null, evidence }
  } catch (error) {
    return { id: link.id, url: link.url, status: 'error', observedAt: null, evidence: '', error: error instanceof Error ? error.message : String(error) }
  }
}

export const generateGtk4LinkReport = async (options: { links: LinkConfig[]; now?: Date }): Promise<LinkReport> => {
  const now = options.now ?? new Date(), entries: LinkReportEntry[] = []
  for (const link of options.links) entries.push(await observe(link, now))
  return { generatedAt: now.toISOString(), entries }
}

const renderMarkdown = (report: LinkReport) =>
  `# GTK4 link monitor\n\n生成日時: ${report.generatedAt}\n\n| ID | ステータス | 最終観測 | 根拠 | エラー |\n| --- | --- | --- | --- | --- |\n${report.entries
    .map((entry) => `| ${entry.id} | ${entry.status} | ${entry.observedAt ?? '-'} | ${entry.evidence || '-'} | ${entry.error ?? '-'} |`)
    .join('\n')}\n`

const readConfig = async (configPath?: string): Promise<LinkConfig[]> => {
  if (!configPath) throw new Error('--config で設定ファイルを指定してください')
  return JSON.parse(await readFile(resolve(configPath), 'utf8')) as LinkConfig[]
}

const writeReportFiles = async (report: LinkReport, outputDir: string) => {
  const resolved = resolve(outputDir)
  await mkdir(resolved, { recursive: true })
  await Promise.all([
    writeFile(join(resolved, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(join(resolved, 'report.md'), renderMarkdown(report), 'utf8')
  ])
}

const runCli = async () => {
  try {
    const args = process.argv.slice(2),
      configIndex = args.indexOf('--config'),
      outIndex = args.indexOf('--out'),
      configPath = configIndex === -1 ? undefined : args[configIndex + 1],
      outputDir = outIndex === -1 ? 'reports/gtk4-links' : args[outIndex + 1]
    const report = await generateGtk4LinkReport({ links: await readConfig(configPath) })
    await writeReportFiles(report, outputDir ?? 'reports/gtk4-links')
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    if (!(error instanceof Error)) throw error
    console.error(error.message)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void runCli()
