import { AGENT_KILL_GRACE_MS } from '../env'
import { spawnCli, versionHealthCheck } from './spawn'
import type { AgentAdapter, AgentRunInput, AgentRunOutput } from './types'

// 00-prerequisites.md에서 확인한 고정값. 추측으로 바꾸지 않는다.
const CLI_PATH = process.env.CLAUDE_CLI_PATH || 'claude'
const MODEL = 'sonnet'
const EFFORT = 'high'

async function run(input: AgentRunInput): Promise<AgentRunOutput> {
  const { stdout, stderr, exitCode } = await spawnCli({
    cliPath: CLI_PATH,
    args: ['-p', '--tools', '', '--output-format', 'text', '--model', MODEL, '--effort', EFFORT],
    input: input.prompt,
    cwd: input.workdir,
    signal: input.signal,
    killGraceMs: AGENT_KILL_GRACE_MS,
  })
  return { content: stdout.trim(), raw: stdout, stderr, exitCode }
}

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  run,
  healthCheck: () => versionHealthCheck(CLI_PATH),
}
