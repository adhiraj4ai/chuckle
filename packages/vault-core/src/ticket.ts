export interface Ticket {
  id: string;
  url?: string;
}

/** Normalize/validate a ticket. Returns null when there is no usable id.
 *  A url is kept only when it parses as http(s); any other scheme is dropped
 *  (the id is still kept), because the url is later handed to the OS opener. */
export function normalizeTicket(
  input: { id?: unknown; url?: unknown } | null | undefined
): Ticket | null {
  if (!input) return null;
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  const ticket: Ticket = { id };
  if (typeof input.url === "string") {
    const u = input.url.trim();
    try {
      const parsed = new URL(u);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") ticket.url = u;
    } catch {
      /* invalid URL — drop it, keep the id */
    }
  }
  return ticket;
}
