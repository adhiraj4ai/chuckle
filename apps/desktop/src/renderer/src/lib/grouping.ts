import type { ApprovalStatus, Category, FeatureEntry } from '@shared/ipc-types'
import { humanizeFeature } from './feature.js'

export type DocType = 'spec' | 'plan' | 'adr'
export type Status = ApprovalStatus | 'not_found'

const DOC_TYPES: DocType[] = ['spec', 'plan', 'adr']

/** Human-readable label for an approval status. */
export function statusLabel(status: Status): string {
  if (status === 'pending') return 'Pending'
  if (status === 'in_review') return 'In review'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Changes requested'
  return 'Open'
}

/** Tinted (bg + text) classes for a status, keeping the status signal visible. */
export function statusTint(status: Status): string {
  if (status === 'pending') return 'bg-wait/15 text-wait'
  if (status === 'in_review') return 'bg-wait/25 text-wait'
  if (status === 'approved') return 'bg-ok/20 text-ok'
  if (status === 'rejected') return 'bg-stop/20 text-stop'
  return 'bg-railfg/10 text-railfg/40'
}

export interface DocRow {
  feature: FeatureEntry
  type: DocType
  status: ApprovalStatus
  path: string
}

export interface FolderGroup {
  folder: string
  docs: DocRow[]
}

const ROOT_FOLDER = 'docs'

/** The immediate parent directory of a `/`-separated project-relative path.
 *  Files directly in the doc root fall back to `docs`. */
function folderOf(p: string): string {
  const segments = p.split('/')
  return segments.length >= 2 ? segments[segments.length - 2] : ROOT_FOLDER
}

/**
 * Group DOCUMENTS (not features) by the immediate parent directory of each
 * markdown file. A feature with its spec and plan in different folders appears
 * under both. Groups sort alphabetically with the root `docs` group last; docs
 * within a group sort by humanized feature name.
 */
export function groupByFolder(features: FeatureEntry[]): FolderGroup[] {
  const byFolder = new Map<string, DocRow[]>()
  for (const feature of features) {
    for (const type of DOC_TYPES) {
      const status = feature[type]
      const path = feature.paths[type]
      if (status === 'not_found' || !path) continue
      const folder = folderOf(path)
      const rows = byFolder.get(folder) ?? []
      rows.push({ feature, type, status, path })
      byFolder.set(folder, rows)
    }
  }
  const groups = [...byFolder.entries()].map(([folder, docs]) => ({
    folder,
    docs: docs.sort((a, b) =>
      humanizeFeature(a.feature.name).localeCompare(humanizeFeature(b.feature.name)),
    ),
  }))
  return groups.sort((a, b) => {
    if (a.folder === ROOT_FOLDER) return 1
    if (b.folder === ROOT_FOLDER) return -1
    return a.folder.localeCompare(b.folder)
  })
}

export function groupByCategory(
  features: FeatureEntry[],
): { category: Category | null; features: FeatureEntry[] }[] {
  const named = new Map<string, { category: Category; features: FeatureEntry[] }>()
  const uncategorized: FeatureEntry[] = []
  for (const f of features) {
    if (f.category) {
      const g = named.get(f.category.id) ?? { category: f.category, features: [] }
      g.features.push(f)
      named.set(f.category.id, g)
    } else {
      uncategorized.push(f)
    }
  }
  const groups = [...named.values()].sort((a, b) =>
    a.category.name.localeCompare(b.category.name),
  ) as { category: Category | null; features: FeatureEntry[] }[]
  if (uncategorized.length) groups.push({ category: null, features: uncategorized })
  return groups
}

export function matchesTagFilter(f: FeatureEntry, active: string[]): boolean {
  return active.every((t) => f.tags.includes(t))
}

export function allTags(features: FeatureEntry[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const f of features) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
