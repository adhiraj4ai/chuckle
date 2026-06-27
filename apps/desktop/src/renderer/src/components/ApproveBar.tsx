import React, { useState } from 'react'
import type { ApprovalStatus, DocumentType, ReviewResult } from '@shared/ipc-types'

interface Props {
  vaultPath: string
  feature: string
  type: DocumentType
  status: ApprovalStatus | 'not_found'
  onActionComplete: (result?: ReviewResult) => void
}

export function ApproveBar({
  vaultPath,
  feature,
  type,
  status,
  onActionComplete,
}: Props): React.ReactElement {
  const [rejectMode, setRejectMode] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (status !== 'pending') return <></>

  async function handleApprove(): Promise<void> {
    setLoading(true)
    const result = await window.chuckle.document.approve(vaultPath, feature, type, null)
    setLoading(false)
    onActionComplete(result)
  }

  async function handleReject(): Promise<void> {
    if (!message.trim()) return
    setLoading(true)
    const result = await window.chuckle.document.reject(vaultPath, feature, type, message)
    setLoading(false)
    setRejectMode(false)
    setMessage('')
    onActionComplete(result)
  }

  return (
    <div className="px-5 py-4 border-b border-line">
      {!rejectMode ? (
        <div className="space-y-2">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-ok text-white text-[13px] font-semibold hover:brightness-95 active:brightness-90 disabled:opacity-50 transition"
          >
            Approve
          </button>
          <button
            onClick={() => setRejectMode(true)}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg border border-line text-ink/80 text-[13px] font-medium hover:bg-mist disabled:opacity-50 transition"
          >
            Request Changes
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-[12px] font-medium text-ink/60 mb-1.5">
            What needs to change?
          </label>
          <textarea
            placeholder="Reason for requesting changes…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            autoFocus
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-iris/30 focus:border-iris/50 placeholder:text-ink/30"
          />
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={handleReject}
              disabled={!message.trim() || loading}
              className="flex-1 px-4 py-2 rounded-lg bg-stop text-white text-[13px] font-semibold hover:brightness-95 disabled:opacity-50 transition"
            >
              Submit
            </button>
            <button
              onClick={() => {
                setRejectMode(false)
                setMessage('')
              }}
              className="px-4 py-2 rounded-lg border border-line text-ink/70 text-[13px] font-medium hover:bg-mist transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
