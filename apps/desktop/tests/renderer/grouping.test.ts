import { describe, it, expect } from 'vitest'
import { groupByCategory, groupByFolder, matchesTagFilter, allTags } from '../../src/renderer/src/lib/grouping'
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
  ticket: null,
  paths: {},
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

describe('groupByFolder', () => {
  it('places a feature with spec and plan in different folders under both groups', () => {
    const feat: FeatureEntry = {
      name: 'user-auth',
      spec: 'pending',
      plan: 'approved',
      adr: 'not_found',
      category: null,
      tags: [],
      tier: 'standard',
      ticket: null,
      paths: { spec: 'docs/specs/user-auth.md', plan: 'docs/plans/user-auth.md' },
    }
    const groups = groupByFolder([feat])
    const specs = groups.find((g) => g.folder === 'specs')
    const plans = groups.find((g) => g.folder === 'plans')
    expect(specs?.docs.map((d) => d.type)).toEqual(['spec'])
    expect(plans?.docs.map((d) => d.type)).toEqual(['plan'])
    expect(specs?.docs[0].feature.name).toBe('user-auth')
    expect(plans?.docs[0].feature.name).toBe('user-auth')
  })

  it('orders folders alphabetically with the root docs group last', () => {
    const mk = (name: string, path: string): FeatureEntry => ({
      name,
      spec: 'pending',
      plan: 'not_found',
      adr: 'not_found',
      category: null,
      tags: [],
      tier: 'standard',
      ticket: null,
      paths: { spec: path },
    })
    const groups = groupByFolder([
      mk('root-doc', 'docs/root-doc.md'),
      mk('spec-one', 'docs/specs/spec-one.md'),
      mk('guide-one', 'docs/guide/guide-one.md'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['guide', 'specs', 'docs'])
  })

  it('groups root-level docs under docs', () => {
    const feat: FeatureEntry = {
      name: 'readme',
      spec: 'pending',
      plan: 'not_found',
      adr: 'not_found',
      category: null,
      tags: [],
      tier: 'standard',
      ticket: null,
      paths: { spec: 'docs/readme.md' },
    }
    const groups = groupByFolder([feat])
    expect(groups).toHaveLength(1)
    expect(groups[0].folder).toBe('docs')
    expect(groups[0].docs[0].feature.name).toBe('readme')
  })

  it('omits doc types that are not_found or lack a path', () => {
    const feat: FeatureEntry = {
      name: 'partial',
      spec: 'pending',
      plan: 'not_found',
      adr: 'pending',
      category: null,
      tags: [],
      tier: 'standard',
      ticket: null,
      // adr is pending but has no path → excluded
      paths: { spec: 'docs/specs/partial.md' },
    }
    const groups = groupByFolder([feat])
    expect(groups).toHaveLength(1)
    expect(groups[0].folder).toBe('specs')
    expect(groups[0].docs.map((d) => d.type)).toEqual(['spec'])
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
