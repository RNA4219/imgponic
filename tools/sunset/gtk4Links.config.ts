import { resolve } from 'node:path'

import { type MonitorConfig } from './linkMonitor'

const repoRoot = process.cwd()
const dataFile = resolve(repoRoot, 'data/gtk4/link-statuses.json')

const config: MonitorConfig = {
  linksFile: resolve(repoRoot, 'docs/gtk4_links.md'),
  defaultFreshnessDays: 14,
  sources: {
    'https://github.com/tauri-apps/tao/pull/1104': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.tao_pr.updatedAt',
      detailField: 'entries.tao_pr.note',
      freshnessDays: 7
    },
    'https://github.com/conradhale/tao': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.tao_fork.updatedAt',
      detailField: 'entries.tao_fork.note'
    },
    'https://github.com/conradhale/wry': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.wry_fork.updatedAt',
      detailField: 'entries.wry_fork.note'
    },
    'https://github.com/tauri-apps/tauri/issues/11928': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.tauri_issue.updatedAt',
      detailField: 'entries.tauri_issue.note'
    },
    'https://github.com/tauri-apps/muda/issues/259': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.muda_issue.updatedAt',
      detailField: 'entries.muda_issue.note'
    },
    'https://docs.rs/tauri-runtime-wry': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.wry_docs.updatedAt',
      detailField: 'entries.wry_docs.note'
    },
    'https://discourse.gnome.org/t/system-tray-icons-in-gtk4/22615': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.gnome_forum.updatedAt',
      detailField: 'entries.gnome_forum.note'
    },
    'https://v2.tauri.app/concept/architecture/': {
      type: 'json',
      filePath: dataFile,
      field: 'entries.tauri_architecture.updatedAt',
      detailField: 'entries.tauri_architecture.note'
    }
  }
}

export default config
export { config }
