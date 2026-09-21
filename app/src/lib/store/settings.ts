import fs from 'node:fs'
import path from 'node:path'

// 설정 파일은 데이터 디렉터리 자신의 위치를 담으므로 데이터 디렉터리 밖(cwd)에 둔다.
export const SETTINGS_PATH = path.resolve(process.cwd(), '.settings.json')

export interface AgentOptions {
  model: string
  effort: string
}

export interface Settings {
  dataDir?: string | null
  timeoutMs?: number | null
  models?: Record<string, AgentOptions>
}

// 매 호출마다 읽는다. 파일 하나라 비용이 무시할 만하고, 재시작 없이 반영된다.
export function readSettings(): Settings {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Settings) : {}
  } catch {
    return {}
  }
}

// 항목별 PUT이 서로의 값을 지우지 않도록 읽고 병합해 쓴다.
// ponytail: read-merge-write, 설정 저장이 동시에 일어날 일이 없어 락 없음. 멀티 유저면 파일 락.
export function writeSettings(patch: Settings): Settings {
  const merged = { ...readSettings(), ...patch }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}
