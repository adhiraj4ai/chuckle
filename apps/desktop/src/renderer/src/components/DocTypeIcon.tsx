import React from 'react'
import { statusTint, statusLabel, type DocType, type Status } from '../lib/grouping.js'

/** Distinct inline SVG glyph per document type, ~14px, drawn in currentColor. */
function Glyph({ type }: { type: DocType }): React.ReactElement {
  if (type === 'plan') {
    // Checklist — a plan is a list of tasks.
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M2 4l1.4 1.4L6 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 11l1.4 1.4L6 10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 4.5h5.5M8.5 11.5h5.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'adr') {
    // Decision / branch — an ADR is a chosen path.
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="4" cy="4" r="1.6" />
        <circle cx="12" cy="4" r="1.6" />
        <circle cx="8" cy="12.5" r="1.6" />
        <path d="M4 5.6v2.4a2 2 0 002 2h.8M12 5.6v2.4a2 2 0 01-2 2h-.8" strokeLinecap="round" />
      </svg>
    )
  }
  // spec — a document with lines of prose.
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M4 2.5h5l3 3V13a0.5 0.5 0 01-.5.5H4a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z" strokeLinejoin="round" />
      <path d="M9 2.5V5.5h3" strokeLinejoin="round" />
      <path d="M5.5 8h5M5.5 10.5h5" strokeLinecap="round" />
    </svg>
  )
}

/** Per-type document icon tinted by approval status, replacing the S/P/A badges. */
export function DocTypeIcon({ type, status }: { type: DocType; status: Status }): React.ReactElement {
  return (
    <span
      title={`${type} — ${statusLabel(status)}`}
      className={`w-4 h-4 grid place-items-center rounded ${statusTint(status)}`}
    >
      <Glyph type={type} />
    </span>
  )
}
