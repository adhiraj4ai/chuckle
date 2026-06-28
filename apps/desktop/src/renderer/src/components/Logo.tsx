import React from 'react'

interface Props {
  size?: number
  className?: string
}

/**
 * SignOff mark — a white checkmark (approved) finishing in a yellow signature
 * flourish (signed off), on a blue tile. Self-contained SVG; light or dark.
 */
export function Logo({ size = 28, className = '' }: Props): React.ReactElement {
  const id = 'signoff-grad'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Signoff"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e40af" />
          <stop offset="1" stopColor="#102356" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      {/* checkmark */}
      <path
        d="M9 16.5l4.6 4.6L23 10.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* signature flourish */}
      <path
        d="M8 24.5c4.5 1.8 11 1.4 16-1.2"
        fill="none"
        stroke="#facc15"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
