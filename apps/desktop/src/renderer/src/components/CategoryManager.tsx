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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30" onClick={onClose}>
      <div
        className="w-[420px] max-h-[80vh] overflow-y-auto rounded-xl bg-surface shadow-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-fg mb-3">Manage categories</h2>

        <ul className="space-y-1.5 mb-4">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 text-[13px]">
              <CategorySwatch color={c.color} />
              <span className="flex-1 text-fg">{c.name}</span>
              <span className="text-fg/40 text-[11px]">used by {usage(c.id)}</span>
              <button onClick={() => void remove(c.id)} className="text-stop/80 hover:text-stop text-[11px]">
                Delete
              </button>
            </li>
          ))}
          {categories.length === 0 && <li className="text-[12.5px] text-fg/40">No categories yet.</li>}
        </ul>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-1">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className={`rounded-full p-0.5 ${color === c ? 'ring-2 ring-iris' : ''}`}
              >
                <CategorySwatch color={c} size={12} />
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category…"
            className="flex-1 rounded-md bg-fg/[0.05] text-fg text-[13px] px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-iris/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
          <button onClick={() => void add()} className="text-[12.5px] font-medium text-iris hover:underline">
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
