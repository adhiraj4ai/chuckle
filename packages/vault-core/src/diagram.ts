/** True when the markdown contains a mermaid fenced block or an embedded image.
 *  A "diagram" for the require_diagram gate is either:
 *   - a fenced block whose info string begins with "mermaid" (case-insensitive), or
 *   - a markdown embedded image `![alt](url)` with a non-empty url.
 *  Other diagram languages (plantuml, dot) are intentionally out of scope for v1. */
export function hasDiagram(markdown: string): boolean {
  const mermaid = /(^|\n)[ \t]*```[ \t]*mermaid\b/i.test(markdown);
  const image = /!\[[^\]]*\]\([^)\s][^)]*\)/.test(markdown);
  return mermaid || image;
}
