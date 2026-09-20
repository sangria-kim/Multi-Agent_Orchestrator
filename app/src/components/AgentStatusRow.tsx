'use client'

import type { AgentView } from '@/lib/store/read'

import { AgentStatusBadge } from './StatusBadge'
import { ElapsedTime } from './ElapsedTime'

const TERMINAL_STATUSES = ['completed', 'failed', 'timeout']

export function AgentStatusRow({
  view,
  onRetry,
  retrying,
}: {
  view: AgentView
  onRetry: (agentId: string) => void
  retrying: boolean
}) {
  const canRetry = TERMINAL_STATUSES.includes(view.status) && !retrying

  return (
    <tr className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
      <td className="py-2 pr-4 font-medium capitalize">{view.id}</td>
      <td className="py-2 pr-4">
        <AgentStatusBadge status={view.status} />
      </td>
      <td className="py-2 pr-4 tabular-nums text-zinc-600 dark:text-zinc-400">
        <ElapsedTime status={view.status} startedAt={view.startedAt} executionTimeMs={view.executionTimeMs} />
      </td>
      <td className="py-2">
        <button
          type="button"
          disabled={!canRetry}
          onClick={() => onRetry(view.id)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          재실행
        </button>
      </td>
    </tr>
  )
}
