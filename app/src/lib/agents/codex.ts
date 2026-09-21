import { AGENT_KILL_GRACE_MS } from '../env'
import { spawnCli, versionHealthCheck } from './spawn'
import type { AgentAdapter, AgentRunInput, AgentRunOutput } from './types'

// 00-prerequisites.md에서 확인한 고정값. 추측으로 바꾸지 않는다.
const CLI_PATH = process.env.CODEX_CLI_PATH || 'codex'
const MODEL = 'gpt-5.6-terra'
const REASONING_EFFORT = 'high'

async function run(input: AgentRunInput): Promise<AgentRunOutput> {
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
      MODEL,
      '-c',
      `model_reasoning_effort=${REASONING_EFFORT}`,
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
