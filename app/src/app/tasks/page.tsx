import Link from 'next/link'

import { TaskStatusBadge } from '@/components/StatusBadge'
import { listTasks } from '@/lib/store/read'
import type { AttemptStatus } from '@/lib/store/types'

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export default function TasksPage() {
  const tasks = listTasks(50)

  if (tasks.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">아직 실행한 작업이 없습니다.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 underline dark:text-blue-400">
          새 요청 시작하기
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">작업 목록</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <th className="py-2 pr-4 font-medium">제목</th>
            <th className="py-2 pr-4 font-medium">상태</th>
            <th className="py-2 pr-4 font-medium">Agent</th>
            <th className="py-2 font-medium">생성 시각</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
              <td className="max-w-xs truncate py-2 pr-4">
                <Link href={`/tasks/${task.id}`} className="hover:underline">
                  {task.title || task.request.slice(0, 40)}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <TaskStatusBadge status={task.taskState} />
              </td>
              <td className="py-2 pr-4">
                <div className="flex gap-1">
                  {Object.entries(task.agentStates).map(([id, status]) => (
                    <AgentDot key={id} id={id} status={status} />
                  ))}
                </div>
              </td>
              <td className="py-2 text-zinc-500 dark:text-zinc-400" title={new Date(task.createdAt).toLocaleString('ko-KR')}>
                {formatRelative(task.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

const DOT_COLOR: Record<AttemptStatus, string> = {
  queued: 'bg-zinc-300 dark:bg-zinc-600',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  timeout: 'bg-amber-500',
}

function AgentDot({ id, status }: { id: string; status: AttemptStatus }) {
  return <span title={`${id}: ${status}`} className={`h-2.5 w-2.5 rounded-full ${DOT_COLOR[status]}`} />
}
