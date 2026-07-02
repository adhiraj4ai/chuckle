export interface Heading { slug: string; text: string; line: number }

/** Slug for a heading's text. Shared by the discussion rail and the in-document
 *  comment affordances so both anchor to the same section id. */
export function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = []
  md.split('\n').forEach((raw, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (!m) return
    const text = m[2].trim()
    out.push({ slug: slugifyHeading(text), text, line: i + 1 })
  })
  return out
}
