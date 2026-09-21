import { AGENT_KILL_GRACE_MS } from '../env'
import { resolveAgentOptions } from './options'
import { spawnCli, versionHealthCheck } from './spawn'
import type { AgentAdapter, AgentRunInput, AgentRunOutput } from './types'

// 00-prerequisites.md에서 확인한 고정값. 추측으로 바꾸지 않는다.
const CLI_PATH = process.env.CODEX_CLI_PATH || 'codex'

async function run(input: AgentRunInput): Promise<AgentRunOutput> {
  // 실행 시점에 읽는다 — 설정 변경이 다음 실행부터 반영된다.
  const { model, effort } = resolveAgentOptions('codex')
  const { stdout, stderr, exitCode } = await spawnCli({
    cliPath: CLI_PATH,
    args: [
      'exec',
      '-',
      '-s',
      'read-only',
      '--skip-git-repo-check',
      '--color',
      'never',
      '--ephemeral',
      '--ignore-user-config',
      '-m',
      model,
      '-c',
      `model_reasoning_effort=${effort}`,
    ],
    input: input.prompt,
    cwd: input.workdir,
    signal: input.signal,
    killGraceMs: AGENT_KILL_GRACE_MS,
  })
  return { content: stdout.trim(), raw: stdout, stderr, exitCode }
}

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  run,
  healthCheck: () => versionHealthCheck(CLI_PATH),
}
