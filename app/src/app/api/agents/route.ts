import { NextResponse } from 'next/server'

import * as registry from '@/lib/agents/registry'
import type { AgentHealth } from '@/lib/agents/types'

// 설치 여부는 프로세스 수명 동안 캐시한다. 파일이 아니라 환경을 조회하는 것이라
// "파일이 진실"이라는 원칙과 충돌하지 않는다 (02-phase2-web-ui.md).
let cache: Record<string, AgentHealth> | null = null

export async function GET() {
  if (!cache) cache = await registry.healthCheckAll()

  const agents = registry.enabled().map((adapter) => ({
    id: adapter.id,
    ...cache![adapter.id],
  }))

  return NextResponse.json({ agents })
}
