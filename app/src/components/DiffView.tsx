'use client'

import { useRef, useState } from 'react'

import type { AgentView } from '@/lib/store/read'

import { ResultPane } from './ResultPane'
import { SectionCompareTable } from './SectionCompareTable'

type Mode = 'side' | 'sections'

function tabClass(active: boolean): string {
  const base = '-mb-px border-b-2 px-3 py-2 text-sm font-medium'
  return active
    ? `${base} border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100`
    : `${base} border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200`
}

// 나란히 보기: 두 결과를 2단으로. 스크롤 동기화는 단순 비율로 한다.
// 섹션 비교: 헤딩만 뽑아 표로 나열한다. 줄 단위 diff는 넣지 않는다 — 공통 조상이
// 없는 두 문서를 줄 단위로 비교하면 거의 모든 줄이 "변경"으로 잡혀 무의미하다.
export function DiffView({ left, right }: { left: AgentView; right: AgentView }) {
  const [mode, setMode] = useState<Mode>('side')
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  function sync(s: HTMLDivElement, t: HTMLDivElement) {
    if (syncing.current) return
    const maxS = s.scrollHeight - s.clientHeight
    const maxT = t.scrollHeight - t.clientHeight
    if (maxS <= 0 || maxT <= 0) return
    // 되돌아오는 scroll 이벤트로 플래그를 내리지 않는다 — scrollTop이 그대로면
    // (양 끝단이거나 이미 같은 위치) 이벤트가 안 와서 다음 스크롤이 통째로 무시된다.
    syncing.current = true
    t.scrollTop = (s.scrollTop / maxS) * maxT
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  const handleLeftScroll = () => {
    if (leftRef.current && rightRef.current) sync(leftRef.current, rightRef.current)
  }
  const handleRightScroll = () => {
    if (rightRef.current && leftRef.current) sync(rightRef.current, leftRef.current)
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button type="button" onClick={() => setMode('side')} className={tabClass(mode === 'side')}>
          나란히 보기
        </button>
        <button type="button" onClick={() => setMode('sections')} className={tabClass(mode === 'sections')}>
          섹션 비교
        </button>
      </div>

      {mode === 'side' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2" style={{ height: '70vh' }}>
          <ResultPane view={left} scrollRef={leftRef} onScroll={handleLeftScroll} />
          <ResultPane view={right} scrollRef={rightRef} onScroll={handleRightScroll} />
        </div>
      ) : (
        <SectionCompareTable labels={[left.id, right.id]} contents={[left.result ?? '', right.result ?? '']} />
      )}
    </div>
  )
}
