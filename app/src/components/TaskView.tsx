'use client'

import { useState } from 'react'

import type { TaskDetail } from '@/lib/store/read'

import { AgentStatusRow } from './AgentStatusRow'
import { DiffView } from './DiffView'
import { ResultPane } from './ResultPane'
import { TaskStatusBadge } from './StatusBadge'
import { useTask } from './useTask'

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(path).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {copied ? '복사됨' : '경로 복사'}
    </button>
  )
}

export function TaskView({ taskId, initial }: { taskId: string; initial: TaskDetail }) {
  const [detail, setDetail] = useTask(taskId, initial)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  async function handleRetry(agentId: string) {
    setRetryError(null)
    setPending(agentId)
    try {
      const res = await fetch(`/api/tasks/${taskId}/agents/${agentId}/retry`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetryError(body.error ?? '재실행 요청이 실패했습니다')
        return
      }
      // 서버가 아직 반영하지 않았어도 화면에서 즉시 폴링을 재개하도록 낙관적으로 반영한다.
      setDetail({
        ...detail,
        taskState: 'running',
        agentViews: detail.agentViews.map((v) =>
          v.id === agentId ? { ...v, status: 'queued', attempt: body.attempt, result: undefined, error: undefined } : v,
        ),
      })
    } finally {
      setPending(null)
    }
  }

  const displayTitle = detail.title || detail.request.slice(0, 60)

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{displayTitle}</h1>
          <TaskStatusBadge status={detail.taskState} />
        </div>
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{detail.request}</p>
        {detail.context && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-500 dark:text-zinc-500">
            <span className="font-medium">Context:</span> {detail.context}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <code className="truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {detail.taskDir}
          </code>
          <CopyPathButton path={detail.taskDir} />
        </div>
      </div>

      {retryError && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {retryError}
        </p>
      )}

      <table className="mb-8 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-2 pr-4 font-medium">Agent</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">실행 시간</th>
            <th className="py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {detail.agentViews.map((view) => (
            <AgentStatusRow key={view.id} view={view} onRetry={handleRetry} retrying={pending === view.id} />
          ))}
        </tbody>
      </table>

      {detail.agentViews.length === 2 ? (
        <DiffView left={detail.agentViews[0]} right={detail.agentViews[1]} />
      ) : (
        detail.agentViews.map((view) => (
          <div key={view.id} style={{ minHeight: '50vh' }}>
            <ResultPane view={view} />
          </div>
        ))
      )}
    </div>
  )
}
