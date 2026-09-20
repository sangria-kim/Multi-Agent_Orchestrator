import Link from 'next/link'

import { TaskView } from '@/components/TaskView'
import { getTaskDetail } from '@/lib/store/read'

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const detail = getTaskDetail(taskId)

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">해당 작업을 찾을 수 없습니다.</p>
        <Link href="/tasks" className="text-sm font-medium text-blue-600 underline dark:text-blue-400">
          작업 목록으로
        </Link>
      </main>
    )
  }

  return <TaskView taskId={taskId} initial={detail} />
}
