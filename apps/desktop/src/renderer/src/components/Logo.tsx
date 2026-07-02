import React from 'react'

interface Props {
  size?: number
  className?: string
}

/**
 * SignOff mark — a fountain-pen nib (signing) with a gold ink reservoir,
 * finishing a signature swash that travels amber (in review) → green (signed
 * off), on the iris brand tile. Self-contained SVG; light or dark.
 */
export function Logo({ size = 28, className = '' }: Props): React.ReactElement {
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
        <linearGradient id="signoff-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d69e0" />
          <stop offset="1" stopColor="#4b47bd" />
        </linearGradient>
        <linearGradient id="signoff-nib" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e7e6f6" />
        </linearGradient>
        <linearGradient id="signoff-swash" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e0a021" />
          <stop offset="1" stopColor="#1f9d6b" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#signoff-tile)" />
      {/* signature swash: amber (in review) → green (signed off) */}
      <path
        d="M8 26.6C13 28.6 20 28 25 24.2"
        fill="none"
        stroke="url(#signoff-swash)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* fountain-pen nib */}
      <path
        d="M16 24.9C12.8 20.4 11 16 11.4 12.1C11.6 9.9 13.6 8.9 16 8.9C18.4 8.9 20.4 9.9 20.6 12.1C21 16 19.2 20.4 16 24.9Z"
        fill="url(#signoff-nib)"
      />
      {/* slit (iris ink) */}
      <line x1="16" y1="13.7" x2="16" y2="23.4" stroke="#4b47bd" strokeWidth="1.1" strokeLinecap="round" />
      {/* ink reservoir (gold) */}
      <circle cx="16" cy="12.4" r="1.6" fill="#d99320" />
    </svg>
  )
}
