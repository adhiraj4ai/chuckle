import React, { useEffect, useState } from 'react'
import type { Category, CategoryColor, FeatureEntry } from '@shared/ipc-types'
import { CATEGORY_COLORS, slugify } from '@shared/ipc-types'
import { CategorySwatch } from './CategorySwatch'

interface Props {
  vaultPath: string
  features: FeatureEntry[]
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export function CategoryManager({
  vaultPath,
  features,
  open,
  onClose,
  onChanged,
}: Props): React.ReactElement | null {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState<CategoryColor>('red')

  async function reload(): Promise<void> {
    setCategories(await window.signoff.categories.list(vaultPath))
  }
  useEffect(() => {
    if (open) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vaultPath])

  if (!open) return null

  const usage = (id: string): number => features.filter((f) => f.category?.id === id).length

  async function add(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    await window.signoff.categories.upsert(vaultPath, { id: slugify(trimmed), name: trimmed, color })
    setName('')
    await reload()
    onChanged()
  }

  async function remove(id: string): Promise<void> {
    await window.signoff.categories.remove(vaultPath, id)
    await reload()
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-fg/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage categories"
        className="w-[440px] max-w-full max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-fg">Manage categories</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-fg text-[13px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40"
          >
            Done
          </button>
        </div>

        <p className="font-mono text-[10.5px] font-semibold tracking-wide text-muted mb-2">
          Categories
        </p>
        <ul className="space-y-0.5 mb-5">
          {categories.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-app transition-colors"
            >
              <CategorySwatch color={c.color} size={12} />
              <span className="flex-1 text-fg truncate">{c.name}</span>
              <span className="text-muted text-[11px] font-mono tabular-nums">used by {usage(c.id)}</span>
              <button
                onClick={() => void remove(c.id)}
                className="text-muted hover:text-stop text-[11px] font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 transition-colors"
              >
                Delete
              </button>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="text-[12.5px] text-muted px-2 py-1.5">
              No categories yet — add your first one below.
            </li>
          )}
        </ul>

        <div className="border-t border-border pt-4">
          <p className="font-mono text-[10.5px] font-semibold tracking-wide text-muted mb-2.5">
            New category
          </p>
          <div className="flex items-center gap-1.5 mb-3">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={`grid place-items-center rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 ${
                  color === c ? 'ring-2 ring-iris ring-offset-1 ring-offset-surface' : 'hover:opacity-80'
                }`}
              >
                <CategorySwatch color={c} size={14} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New category…"
              className="flex-1 rounded-md border border-border bg-app text-fg text-[13px] px-2.5 py-1.5 placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 focus:border-iris/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
            />
            <button
              onClick={() => void add()}
              className="rounded-md bg-iris px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-iris-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
