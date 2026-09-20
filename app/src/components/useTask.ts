'use client'

import { useEffect, useState } from 'react'

import type { TaskDetail } from '@/lib/store/read'
import type { TaskState } from '@/lib/store/types'

// 종료 상태 집합. 폴링 중단 조건과 목록 배지가 모두 이 집합을 쓴다.
// partial_completed를 빠뜨리면 한쪽만 성공한 Task가 영원히 1초 폴링하게 된다.
const TERMINAL_STATES: TaskState[] = ['completed', 'partial_completed', 'failed']

// setDetail도 함께 돌려준다. 재실행 직후처럼, 서버가 아직 running으로 갱신하지
// 않았더라도 화면에서 즉시 폴링을 재개해야 하는 경우 호출자가 낙관적으로 반영한다.
export function useTask(taskId: string, initial: TaskDetail): [TaskDetail, (next: TaskDetail) => void] {
  const [detail, setDetail] = useState<TaskDetail>(initial)

  useEffect(() => {
    if (TERMINAL_STATES.includes(detail.taskState)) return

    let cancelled = false
    const id = setInterval(async () => {
      const res = await fetch(`/api/tasks/${taskId}`, { cache: 'no-store' })
      if (cancelled || !res.ok) return
      const next: TaskDetail = await res.json()

      // completed인데 result.md가 아직 없는 회차는 버리고 다음 회차를 기다린다.
      const inconsistent = next.agentViews.some((v) => v.status === 'completed' && !v.result)
      if (inconsistent) return

      if (!cancelled) setDetail(next)
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [taskId, detail.taskState])

  return [detail, setDetail]
}
