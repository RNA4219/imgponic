import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  archiveRuns,
  JsonlValidationError,
  NoRunsFoundError
} from '../sunset/archiveRuns'

const execFileAsync = promisify(execFile)

let workspace: string
let runsDir: string
let outputDir: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'archive-runs-'))
  runsDir = join(workspace, 'runs')
  outputDir = join(workspace, 'out')
  await mkdir(runsDir)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

const writeJsonl = async (target: string, lines: Record<string, unknown>[]) => {
  await writeFile(target, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

const hashFile = async (path: string) => {
  const data = await readFile(path)
  return createHash('sha256').update(data).digest('hex')
}

const createRun = async (name: string, payload: Record<string, unknown>[]) => {
  const dir = join(runsDir, name)
  await mkdir(dir)
  await writeJsonl(join(dir, 'response.raw.jsonl'), payload)
  return dir
}

describe('archiveRuns', () => {
  test('最新の runs を圧縮しマニフェストを出力する', async () => {
    await createRun('20240101T000000Z', [{ id: 1 }])
    const runB = await createRun('20240102T000000Z', [{ id: 2 }, { id: 3 }])
    const runC = await createRun('20240103T000000Z', [{ id: 4 }])

    const result = await archiveRuns({ runsDirectory: runsDir, limit: 2, outputDirectory: outputDir })

    expect(result.includedRuns).toEqual(['20240103T000000Z', '20240102T000000Z'])

    const { stdout } = await execFileAsync('tar', ['-tzf', result.archivePath])
    expect(stdout).toContain('20240103T000000Z/response.raw.jsonl')
    expect(stdout).toContain('20240102T000000Z/response.raw.jsonl')
    expect(stdout).not.toContain('20240101T000000Z/response.raw.jsonl')

    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as {
      files: Array<{ path: string; sha256: string }>
    }

    const expected = [
      {
        path: '20240102T000000Z/response.raw.jsonl',
        sha256: await hashFile(join(runB, 'response.raw.jsonl'))
      },
      {
        path: '20240103T000000Z/response.raw.jsonl',
        sha256: await hashFile(join(runC, 'response.raw.jsonl'))
      }
    ]

    expect(manifest.files).toEqual(expected)
  })

  test('有効な runs ディレクトリが無い場合は失敗する', async () => {
    await expect(
      archiveRuns({ runsDirectory: runsDir, limit: 1, outputDirectory: outputDir })
    ).rejects.toBeInstanceOf(NoRunsFoundError)
  })

  test('response.raw.jsonl が壊れている runs は弾く', async () => {
    const brokenDir = join(runsDir, '20240104T000000Z')
    await mkdir(brokenDir)
    await writeFile(join(brokenDir, 'response.raw.jsonl'), '{"ok": true}\n{bad json}\n', 'utf8')

    await expect(
      archiveRuns({ runsDirectory: runsDir, limit: 1, outputDirectory: outputDir })
    ).rejects.toBeInstanceOf(JsonlValidationError)
  })
})
