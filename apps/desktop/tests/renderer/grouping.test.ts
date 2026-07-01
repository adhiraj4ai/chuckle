import { describe, it, expect } from 'vitest'
import { groupByCategory, matchesTagFilter, allTags } from '../../src/renderer/src/lib/grouping'
import type { FeatureEntry } from '../../src/shared/ipc-types'

const cat = (id: string, name: string) => ({ id, name, color: 'blue' as const })
const f = (name: string, category: FeatureEntry['category'], tags: string[]): FeatureEntry => ({
  name,
  spec: 'pending',
  plan: 'not_found',
  adr: 'not_found',
  category,
  tags,
  tier: 'standard',
})

describe('groupByCategory', () => {
  it('groups by category and sorts Uncategorized last', () => {
    const groups = groupByCategory([
      f('a', cat('backend', 'Backend'), []),
      f('b', null, []),
      f('c', cat('ui', 'UI'), []),
    ])
    expect(groups.map((g) => g.category?.name ?? 'Uncategorized')).toEqual(['Backend', 'UI', 'Uncategorized'])
  })
})

describe('matchesTagFilter', () => {
  it('requires all active tags (AND)', () => {
    const feat = f('a', null, ['security', 'v2'])
    expect(matchesTagFilter(feat, ['security'])).toBe(true)
    expect(matchesTagFilter(feat, ['security', 'v3'])).toBe(false)
    expect(matchesTagFilter(feat, [])).toBe(true)
  })
})

describe('allTags', () => {
  it('counts and sorts by count desc then name', () => {
    expect(allTags([f('a', null, ['x', 'y']), f('b', null, ['x'])])).toEqual([
      { tag: 'x', count: 2 },
      { tag: 'y', count: 1 },
    ])
  })
})
