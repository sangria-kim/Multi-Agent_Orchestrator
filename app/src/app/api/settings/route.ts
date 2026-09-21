import fs from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { hasRunningAgents } from '@/lib/orchestrator/runner'
import { dataDirWithSource, saveDataDir } from '@/lib/store/paths'

export async function GET() {
  return NextResponse.json(dataDirWithSource())
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || (body.dataDir !== null && typeof body.dataDir !== 'string')) {
    return NextResponse.json({ error: '저장 위치가 필요합니다' }, { status: 400 })
  }
  if (hasRunningAgents()) {
    return NextResponse.json({ error: '실행 중인 작업이 끝난 뒤에 변경할 수 있습니다' }, { status: 409 })
  }

  const dir = typeof body.dataDir === 'string' ? body.dataDir.trim() : ''
  if (dir) {
    if (!path.isAbsolute(dir)) {
      return NextResponse.json({ error: '절대 경로를 입력해주세요 (예: /Users/me/multi-data)' }, { status: 400 })
    }
    // 실제로 만들고 써봐야 권한·잘못된 경로를 저장 전에 걸러낼 수 있다.
    try {
      const probe = path.join(dir, '.write-probe')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(probe, '')
      fs.unlinkSync(probe)
    } catch (err) {
      return NextResponse.json(
        { error: `해당 경로에 쓸 수 없습니다: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 },
      )
    }
  }

  saveDataDir(dir || null)
  return NextResponse.json(dataDirWithSource())
}
