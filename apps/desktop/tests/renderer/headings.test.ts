import { it, expect } from 'vitest'
import { extractHeadings } from '@renderer/lib/headings'
it('extracts heading slug, text, and 1-based line', () => {
  const md = '# Title\n\nintro\n\n## Goals\n\n- a\n\n## Non-Goals\n'
  expect(extractHeadings(md)).toEqual([
    { slug: 'title', text: 'Title', line: 1 },
    { slug: 'goals', text: 'Goals', line: 5 },
    { slug: 'non-goals', text: 'Non-Goals', line: 9 },
  ])
})
