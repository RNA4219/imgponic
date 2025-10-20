import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export type MonitorSource =
  | { type: 'git'; repoPath: string; ref?: string; freshnessDays?: number }
  | { type: 'rss'; filePath: string; freshnessDays?: number }
  | { type: 'json'; filePath: string; field: string; detailField?: string; freshnessDays?: number }
export type MonitorConfig = { linksFile: string; sources: Record<string, MonitorSource>; defaultFreshnessDays?: number }
export type CollectOptions = { now?: Date; outputDirectory?: string; emitMarkdown?: boolean }
export type LinkStatus = { link: string; title: string; status: 'fresh' | 'stale' | 'missing' | 'unknown'; updatedAt?: string; checkedAt: string; details?: string }

const execFileAsync = promisify(execFile)

class LinkMonitorError extends Error {
  constructor(message: string, readonly retryable: boolean, name = 'LinkMonitorError') {
    super(message)
    this.name = name
  }
}

class SourceEvaluationError extends LinkMonitorError {
  constructor(message: string, retryable = false) {
    super(message, retryable, 'SourceEvaluationError')
  }
}

class ConfigError extends LinkMonitorError {
  constructor(message: string) {
    super(message, false, 'ConfigError')
  }
}

type LinkEntry = { title: string; link: string }
type EvaluationResult = { updatedAt?: Date; details?: string }

const parseLinksTable = async (filePath: string): Promise<LinkEntry[]> => {
  const content = await readFile(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const entries: LinkEntry[] = []
  for (const line of lines) {
    const match = line.match(/\|\s*\[(?<title>[^\]]+)\]\((?<link>[^\)]+)\)/)
    if (match?.groups) {
      entries.push({ title: match.groups.title.trim(), link: match.groups.link.trim() })
    }
  }
  return entries
}

const getFreshnessDays = (source: MonitorSource, fallback: number) => source.freshnessDays ?? fallback

const determineStatus = (updatedAt: Date | undefined, now: Date, freshnessDays: number) => {
  if (!updatedAt) return 'missing'
  const ageMs = now.getTime() - updatedAt.getTime()
  if (!Number.isFinite(ageMs) || Number.isNaN(ageMs)) return 'missing'
  return ageMs <= freshnessDays * 86400000 ? 'fresh' : 'stale'
}

const evaluateGit = async (source: Extract<MonitorSource, { type: 'git' }>): Promise<EvaluationResult> => {
  const repoPath = resolve(source.repoPath)
  const ref = source.ref ?? 'HEAD'
  try {
    const [{ stdout: commitSha }, { stdout: commitDate }] = await Promise.all([
      execFileAsync('git', ['-C', repoPath, 'rev-parse', ref]),
      execFileAsync('git', ['-C', repoPath, 'log', '-1', '--format=%cI', ref])
    ])
    const sha = commitSha.trim()
    const iso = commitDate.trim()
    const parsedDate = iso.length > 0 ? new Date(iso) : undefined
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      throw new SourceEvaluationError(`git のコミット日時を解析できません: ${iso}`)
    }
    return { updatedAt: parsedDate, details: `git:${sha.slice(0, 12)} (${ref})` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new SourceEvaluationError(`git リポジトリを評価できません: ${reason}`, true)
  }
}

const evaluateRss = async (source: Extract<MonitorSource, { type: 'rss' }>): Promise<EvaluationResult> => {
  const content = await readFile(source.filePath, 'utf8').catch((error) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new SourceEvaluationError(`RSS を読み込めません: ${reason}`)
  })
  const matches = [...content.matchAll(/<(pubDate|updated)>([^<]+)<\/\1>/gi)]
  if (matches.length === 0) {
    throw new SourceEvaluationError('RSS に pubDate/updated が見つかりません')
  }
  const latest = matches
    .map((match) => new Date(match[2]!.trim()))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  if (!latest) throw new SourceEvaluationError('RSS の日時を解析できません')
  return { updatedAt: latest, details: `rss:${latest.toISOString()}` }
}

const extractJsonField = (data: unknown, field: string): unknown => {
  const segments = field.split('.')
  let current: unknown = data
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) current = (current as Record<string, unknown>)[segment]
    else return undefined
  }
  return current
}

const evaluateJson = async (source: Extract<MonitorSource, { type: 'json' }>): Promise<EvaluationResult> => {
  const content = await readFile(source.filePath, 'utf8').catch((error) => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new SourceEvaluationError(`JSON を読み込めません: ${reason}`)
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new SourceEvaluationError(`JSON を解析できません: ${reason}`)
  }
  const value = extractJsonField(parsed, source.field)
  if (typeof value !== 'string') {
    throw new SourceEvaluationError(`JSON のフィールド ${source.field} が文字列ではありません`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new SourceEvaluationError(`JSON フィールド ${source.field} の日時を解析できません: ${value}`)
  }
  let details: string | undefined
  if (source.detailField) {
    const detailValue = extractJsonField(parsed, source.detailField)
    if (typeof detailValue === 'string' && detailValue.trim().length > 0) {
      details = detailValue.trim()
    }
  }
  return { updatedAt: date, details: details ?? `json:${source.field}` }
}

const evaluateSource = async (source: MonitorSource): Promise<EvaluationResult> => {
  if (source.type === 'git') return evaluateGit(source)
  if (source.type === 'rss') return evaluateRss(source)
  if (source.type === 'json') return evaluateJson(source)
  throw new ConfigError(`未知のソースタイプです: ${(source as { type: string }).type}`)
}

export const collectLinkStatuses = async (
  config: MonitorConfig,
  options: CollectOptions = {}
): Promise<LinkStatus[]> => {
  const now = options.now ?? new Date()
  const fallback = config.defaultFreshnessDays ?? 30
  const entries = await parseLinksTable(config.linksFile)
  const results: LinkStatus[] = []
  for (const entry of entries) {
    const source = config.sources[entry.link]
    if (!source) {
      results.push({ ...entry, status: 'unknown', checkedAt: now.toISOString() })
      continue
    }
    try {
      const evaluation = await evaluateSource(source)
      const status = determineStatus(evaluation.updatedAt, now, getFreshnessDays(source, fallback))
      results.push({
        ...entry,
        status,
        updatedAt: evaluation.updatedAt?.toISOString(),
        checkedAt: now.toISOString(),
        details: evaluation.details
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      results.push({ ...entry, status: 'missing', checkedAt: now.toISOString(), details: reason })
    }
  }

  if (options.outputDirectory) {
    await emitReports(results, options.outputDirectory, now, options.emitMarkdown ?? true)
  }

  return results
}

const emitReports = async (statuses: LinkStatus[], outputDirectory: string, now: Date, emitMarkdown: boolean) => {
  const directory = resolve(outputDirectory)
  await mkdir(directory, { recursive: true })
  const baseName = `gtk4-links-${now.toISOString().replace(/[:]/g, '').replace(/\..*/, '')}`
  const jsonPath = join(directory, `${baseName}.json`)
  await writeFile(jsonPath, `${JSON.stringify({ generatedAt: now.toISOString(), items: statuses }, null, 2)}\n`, 'utf8')
  if (emitMarkdown) {
    const markdownPath = join(directory, `${baseName}.md`)
    const lines = ['# GTK4 リンク監視レポート', '', `生成時刻: ${now.toISOString()}`, '', '| リンク | ステータス | 更新日時 | 詳細 |', '| --- | --- | --- | --- |']
    for (const item of statuses) {
      lines.push(
        `| [${item.title}](${item.link}) | ${item.status} | ${item.updatedAt ?? '-'} | ${item.details ?? '-'} |`
      )
    }
    await writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8')
  }
  return { jsonPath, markdownPath: emitMarkdown ? join(directory, `${baseName}.md`) : undefined }
}

const parseArgs = (argv: string[]): { configPath: string; output?: string; markdown: boolean } => {
  let configPath: string | undefined
  let output: string | undefined
  let markdown = true
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--config') configPath = argv[++i]
    else if (arg === '--out') output = argv[++i]
    else if (arg === '--no-markdown') markdown = false
    else throw new ConfigError(`未知の引数です: ${arg}`)
  }
  if (!configPath) throw new ConfigError('--config で設定ファイルを指定してください')
  return { configPath, output, markdown }
}

const runCli = async () => {
  try {
    const args = parseArgs(process.argv.slice(2))
    const modulePath = pathToFileURL(resolve(args.configPath)).href
    const module = (await import(modulePath)) as { default?: MonitorConfig; config?: MonitorConfig }
    const config = module.default ?? module.config
    if (!config) throw new ConfigError('設定ファイルに MonitorConfig が見つかりません')
    const outputDirectory = args.output ?? join('reports')
    const statuses = await collectLinkStatuses(config, { outputDirectory, emitMarkdown: args.markdown })
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), items: statuses }, null, 2))
  } catch (error) {
    if (error instanceof LinkMonitorError) {
      console.error(error.message)
      process.exitCode = 1
    } else {
      throw error
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void runCli()
}

export { LinkMonitorError, ConfigError, SourceEvaluationError, parseArgs, runCli }
