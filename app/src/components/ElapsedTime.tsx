'use client'

import { useEffect, useState } from 'react'

import type { AttemptStatus } from '@/lib/store/types'

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

// Running 중에는 startedAt 기준으로 1초마다 증가시키고, 종료 후에는 executionTimeMs로
// 고정한다. 진행 중에도 시간이 흐르는 게 보여야 멈춘 것처럼 느껴지지 않는다.
export function ElapsedTime({
  status,
  startedAt,
  executionTimeMs,
}: {
  status: AttemptStatus
  startedAt?: string
  executionTimeMs?: number
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status])

  if (status === 'running' && startedAt) {
    return <span>{formatDuration(now - new Date(startedAt).getTime())}</span>
  }
  if (executionTimeMs !== undefined) {
    return <span>{formatDuration(executionTimeMs)}</span>
  }
  return <span>—</span>
}
