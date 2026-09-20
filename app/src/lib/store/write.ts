import fs from 'node:fs'
import path from 'node:path'

import { readAgentStatus } from './read'
import { statusPath } from './paths'
import type { AttemptRecord, AttemptStatus } from './types'

// 쓰기는 항상 원자적으로 한다: 같은 디렉터리에 임시 파일로 쓰고 rename으로 교체한다.
// 같은 파일시스템 안의 rename은 원자적이라, 폴링하는 쪽은 항상 완결된 파일을 본다.
function writeAtomic(filePath: string, data: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, data, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

export function writeTextAtomic(filePath: string, text: string): void {
  writeAtomic(filePath, text)
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  writeAtomic(filePath, JSON.stringify(data, null, 2))
}

// status.json을 읽어 지정한 attempt 항목을 patch로 병합하고 다시 원자적으로 쓴다.
// 파일이 없으면 새로 만든다. status.json은 항상 마지막에 쓴다는 순서 규칙은
// 호출자(runner)가 result.md/error.txt를 먼저 쓴 뒤 이 함수를 호출하는 것으로 지킨다.
export function updateAgentStatus(
  taskId: string,
  agentId: string,
  attempt: number,
  patch: Partial<Omit<AttemptRecord, 'attempt'>> & { status: AttemptStatus },
): void {
  const existing = readAgentStatus(taskId, agentId)
  const attempts = existing ? [...existing.attempts] : []
  const idx = attempts.findIndex((a) => a.attempt === attempt)
  const merged: AttemptRecord = idx >= 0 ? { ...attempts[idx], ...patch, attempt } : { attempt, ...patch }
  if (idx >= 0) attempts[idx] = merged
  else attempts.push(merged)

  writeJsonAtomic(statusPath(taskId, agentId), {
    agent: agentId,
    latestAttempt: attempt,
    attempts,
  })
}
