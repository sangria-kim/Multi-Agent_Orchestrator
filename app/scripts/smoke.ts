// UI 없이 Runner를 직접 호출해 Phase 1 완료 조건을 확인한다.
//   node --env-file=.env.local --import tsx ./scripts/smoke.ts
//
// .env.local이 로드된 뒤에 lib 모듈을 import해야 lib/store/paths.ts의 DATA_DIR
// 모듈 상수가 올바른 ORCHESTRATOR_DATA_DIR을 본다. 정적 import는 다른 코드보다
// 먼저 실행되므로, 이 파일의 실제 로직은 동적 import로 감싼 main()에서 수행한다.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const { createTask, runTask, hookShutdown } = await import('../src/lib/orchestrator/runner')
  const { execWorkdir, promptPath, resultPath } = await import('../src/lib/store/paths')
  const { readAgentStatus, computeTaskState } = await import('../src/lib/store/read')

  hookShutdown()

  const REPO_ROOT = path.resolve(process.cwd(), '..')
  let failures = 0
  function check(label: string, ok: boolean, detail?: string) {
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`)
    if (!ok) failures++
  }

  console.log('--- git status (실행 전) ---')
  const { execSync } = await import('node:child_process')
  const gitBefore = execSync('git status --short', { cwd: REPO_ROOT }).toString()

  const { taskId, agentIds, prompt } = await createTask({
    title: 'PRD 템플릿 제안',
    request:
      '새 기능을 위한 PRD(제품 요구사항 문서) 템플릿 구조를 제안해줘. 어떤 섹션들이 필요한지, 각 섹션에 무엇을 담아야 하는지 설명해줘.',
    context: null,
  })
  console.log(`taskId=${taskId} agents=${agentIds.join(',')}`)

  const rawOutputs: Record<string, { raw: string; content: string }> = {}
  await runTask(taskId, prompt, agentIds, {
    onOutput: (agentId, output) => {
      rawOutputs[agentId] = { raw: output.raw, content: output.content }
    },
  })

  // CLI stdout 원문(메모리)과 result.md(디스크)가 앞뒤 공백 외에 동일한가
  for (const id of agentIds) {
    const p = resultPath(taskId, id, 1)
    if (fs.existsSync(p) && rawOutputs[id]) {
      const onDisk = fs.readFileSync(p, 'utf8')
      check(`${id} stdout 원문(trim)과 result.md가 일치`, rawOutputs[id].raw.trim() === onDisk && rawOutputs[id].content === onDisk)
    }
  }

  // 1. prompt.md 해시가 실제로 넘긴 prompt 문자열과 일치하는가
  const promptOnDisk = fs.readFileSync(promptPath(taskId), 'utf8')
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex')
  const promptOnDiskHash = crypto.createHash('sha256').update(promptOnDisk).digest('hex')
  check('prompt.md 해시가 Adapter에 넘긴 prompt와 일치', promptHash === promptOnDiskHash)

  // 2. 두 Agent가 동시에 시작했는가 (startedAt 간격이 수 초 이내)
  const statuses = agentIds.map((id) => ({ id, status: readAgentStatus(taskId, id) }))
  const startedAtMs = statuses.map((s) => new Date(s.status!.attempts[0].startedAt!).getTime())
  const spread = Math.max(...startedAtMs) - Math.min(...startedAtMs)
  check('두 Agent의 startedAt 간격이 5초 이내', spread < 5000, `${spread}ms`)

  // 3. 각 Agent의 result.md 존재 + 서로 다른 내용
  const contents: Record<string, string> = {}
  for (const id of agentIds) {
    const p = resultPath(taskId, id, 1)
    check(`${id}/attempt-1/result.md 존재`, fs.existsSync(p))
    if (fs.existsSync(p)) contents[id] = fs.readFileSync(p, 'utf8')
  }
  if (agentIds.length >= 2) {
    const values = Object.values(contents)
    check('두 Agent의 result.md 내용이 서로 다르다', new Set(values).size === values.length)
  }

  // 4. 이 프로젝트 내용이 섞여 있지 않은가 (cwd 격리 확인)
  const leakMarkers = ['multi-orchestrator', '00-prerequisites', 'ORCHESTRATOR_DATA_DIR', 'claude/multi']
  for (const [id, content] of Object.entries(contents)) {
    const leaked = leakMarkers.some((m) => content.includes(m))
    check(`${id} 결과에 프로젝트 내용이 섞이지 않음`, !leaked)
  }

  // 5. Task 상태 계산이 completed인가
  const taskState = computeTaskState(taskId, agentIds)
  check('Task 상태 계산 결과가 completed', taskState === 'completed', taskState)

  // 6. 실행 cwd가 레포 밖 임시 디렉터리였고, 실행 후 삭제되었는가
  for (const id of agentIds) {
    const workdir = execWorkdir(taskId, id, 1)
    check(`${id} 실행 cwd가 레포 밖`, !workdir.startsWith(REPO_ROOT), workdir)
    check(`${id} 임시 디렉터리가 실행 후 삭제됨`, !fs.existsSync(workdir))
  }

  // 7. 레포 안 파일이 하나도 바뀌지 않았는가
  const gitAfter = execSync('git status --short', { cwd: REPO_ROOT }).toString()
  check('레포 안 git status가 실행 전후 동일 (레포 파일 변경 없음)', gitBefore === gitAfter)

  console.log(`\n${failures === 0 ? '모두 통과' : `${failures}개 실패`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
