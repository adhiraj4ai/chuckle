export interface Heading { slug: string; text: string; line: number }
export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = []
  md.split('\n').forEach((raw, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw)
    if (!m) return
    const text = m[2].trim()
    const slug = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
    out.push({ slug, text, line: i + 1 })
  })
  return out
}
