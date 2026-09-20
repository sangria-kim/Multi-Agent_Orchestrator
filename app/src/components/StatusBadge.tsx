import type { AttemptStatus, TaskState } from '@/lib/store/types'

const AGENT_STATUS_LABEL: Record<AttemptStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  timeout: 'Timeout',
}

const AGENT_STATUS_CLASS: Record<AttemptStatus, string> = {
  queued: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  timeout: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

const TASK_STATUS_LABEL: Record<TaskState, string> = {
  running: 'Running',
  completed: 'Completed',
  partial_completed: 'Partial',
  failed: 'Failed',
}

const TASK_STATUS_CLASS: Record<TaskState, string> = {
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  partial_completed: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'

export function AgentStatusBadge({ status }: { status: AttemptStatus }) {
  return <span className={`${BASE} ${AGENT_STATUS_CLASS[status]}`}>{AGENT_STATUS_LABEL[status]}</span>
}

export function TaskStatusBadge({ status }: { status: TaskState }) {
  return <span className={`${BASE} ${TASK_STATUS_CLASS[status]}`}>{TASK_STATUS_LABEL[status]}</span>
}
