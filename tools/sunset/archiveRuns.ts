import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type ManifestEntry = { path: string; sha256: string }
type ArchiveRunsOptions = { runsDirectory?: string; limit?: number; outputDirectory?: string }
type ArchiveRunsResult = { archivePath: string; manifestPath: string; includedRuns: string[] }

class ArchiveRunsError extends Error {
  constructor(message: string, readonly retryable: boolean, name = 'ArchiveRunsError') {
    super(message)
    this.name = name
  }
}
class RunStructureError extends ArchiveRunsError {
  constructor(message: string) {
    super(message, false, 'RunStructureError')
  }
}
class JsonlValidationError extends ArchiveRunsError {
  constructor(message: string, readonly line: number) {
    super(message, false, 'JsonlValidationError')
  }
}
class NoRunsFoundError extends ArchiveRunsError {
  constructor(message: string) {
    super(message, true, 'NoRunsFoundError')
  }
}

const archiveRuns = async (options: ArchiveRunsOptions = {}): Promise<ArchiveRunsResult> => {
  const runsDirectory = resolve(options.runsDirectory ?? 'runs')
  const limit = options.limit ?? 5
  if (!Number.isInteger(limit) || limit <= 0) throw new RunStructureError('limit は 1 以上の整数で指定してください')
  const outputDirectory = resolve(options.outputDirectory ?? join(runsDirectory, '..', 'archives'))
  await mkdir(outputDirectory, { recursive: true })

  const selectedRuns = (await readdir(runsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, limit)
  if (selectedRuns.length === 0) {
    throw new NoRunsFoundError(`runs ディレクトリにアーカイブ対象がありません: ${runsDirectory}`)
  }

  for (const runName of selectedRuns) {
    const responsePath = join(runsDirectory, runName, 'response.raw.jsonl')
    try {
      await access(responsePath)
    } catch {
      throw new RunStructureError(`response.raw.jsonl が見つかりません: ${responsePath}`)
    }
    await validateJsonl(responsePath)
  }

  const archiveBase = `runs-${selectedRuns[0]}-${selectedRuns[selectedRuns.length - 1]}`
  const archivePath = join(outputDirectory, `${archiveBase}.tar.gz`)
  await createArchive(runsDirectory, selectedRuns, archivePath)

  const manifestEntries: ManifestEntry[] = []
  for (const runName of selectedRuns) {
    await collectHashes(join(runsDirectory, runName), runName, manifestEntries)
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path))

  const manifestPath = join(outputDirectory, `${archiveBase}.sha256.json`)
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        archive: basename(archivePath),
        runs: selectedRuns,
        files: manifestEntries
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  return { archivePath, manifestPath, includedRuns: selectedRuns }
}

const collectHashes = async (basePath: string, relative: string, acc: ManifestEntry[]): Promise<void> => {
  for (const entry of await readdir(basePath, { withFileTypes: true })) {
    const entryPath = join(basePath, entry.name)
    const entryRelative = join(relative, entry.name)
    if (entry.isDirectory()) {
      await collectHashes(entryPath, entryRelative, acc)
    } else if ((await stat(entryPath)).isFile()) {
      const sha256 = createHash('sha256').update(await readFile(entryPath)).digest('hex')
      acc.push({ path: entryRelative, sha256 })
    }
  }
}

const createArchive = async (runsDirectory: string, runNames: string[], archivePath: string) => {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('tar', ['-czf', archivePath, ...runNames], {
      cwd: runsDirectory,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      rejectPromise(new ArchiveRunsError(`tar の起動に失敗しました: ${error.message}`, true))
    })
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new ArchiveRunsError(`tar の実行に失敗しました (code=${code}): ${stderr}`, true))
    })
  })
}

const validateJsonl = async (filePath: string) => {
  const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.length === 0) continue
    try {
      JSON.parse(line)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new JsonlValidationError(`JSONL が不正です (${filePath}:${index + 1}): ${detail}`, index + 1)
    }
  }
}

const parseArgs = (argv: string[]): ArchiveRunsOptions => {
  const options: ArchiveRunsOptions = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--runs') options.runsDirectory = argv[++i]
    else if (arg === '--limit') {
      const value = Number.parseInt(argv[++i] ?? '', 10)
      if (Number.isNaN(value)) throw new RunStructureError('--limit には整数を指定してください')
      options.limit = value
    } else if (arg === '--out') options.outputDirectory = argv[++i]
    else throw new RunStructureError(`未知の引数です: ${arg}`)
  }
  return options
}

const runCli = async () => {
  try {
    const result = await archiveRuns(parseArgs(process.argv.slice(2)))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (error instanceof ArchiveRunsError) {
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

export {
  archiveRuns,
  ArchiveRunsError,
  JsonlValidationError,
  NoRunsFoundError,
  RunStructureError,
  type ArchiveRunsOptions,
  type ArchiveRunsResult
}
