import type { Category, FeatureEntry } from '@shared/ipc-types'

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
