'use client'

import type { ReactNode, RefObject } from 'react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { AgentView } from '@/lib/store/read'

import { AgentStatusBadge } from './StatusBadge'
import { CopyButton } from './CopyButton'

function MarkdownBody({ content }: { content: string }) {
  const [raw, setRaw] = useState(false)
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {raw ? '렌더링 보기' : '원문 보기'}
        </button>
      </div>
      {raw ? (
        <pre className="whitespace-pre-wrap break-words text-sm">{content}</pre>
      ) : (
        <article className="markdown-body text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      )}
    </div>
  )
}

export function ResultPane({
  view,
  onScroll,
  scrollRef,
}: {
  view: AgentView
  onScroll?: () => void
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const [showPrevious, setShowPrevious] = useState(false)

  let body: ReactNode
  if (view.status === 'queued' || view.status === 'running') {
    body = <p className="text-sm text-zinc-500 dark:text-zinc-400">실행 중…</p>
  } else if (view.status === 'completed' && view.result) {
    body = <MarkdownBody content={view.result} />
  } else if ((view.status === 'failed' || view.status === 'timeout') && showPrevious && view.previousCompleted) {
    body = (
      <div>
        <button
          type="button"
          onClick={() => setShowPrevious(false)}
          className="mb-2 text-xs font-medium text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← 에러로 돌아가기
        </button>
        <MarkdownBody content={view.previousCompleted.result} />
      </div>
    )
  } else if (view.status === 'failed' || view.status === 'timeout') {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-red-600 dark:text-red-400">
          {view.status === 'timeout' ? '실행 시간이 초과되었습니다.' : '실행이 실패했습니다.'}
        </p>
        {view.previousCompleted && (
          <button
            type="button"
            onClick={() => setShowPrevious(true)}
            className="text-xs font-medium text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            이전 성공 결과 보기 (attempt-{view.previousCompleted.attempt})
          </button>
        )}
        {view.error && (
          <details className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
            <summary className="cursor-pointer text-xs font-medium text-zinc-500 dark:text-zinc-400">
              에러 전문 보기
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-600 dark:text-zinc-400">
              {view.error}
            </pre>
          </details>
        )}
      </div>
    )
  } else {
    body = <p className="text-sm text-zinc-500 dark:text-zinc-400">대기 중…</p>
  }

  return (
    // min-h-0: grid/flex 자식은 min-height가 auto라 이게 없으면 콘텐츠 높이만큼
    // 늘어나 부모의 70vh를 무시하고, 패널 내부 스크롤이 아예 생기지 않는다.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-medium capitalize">{view.id}</span>
          <AgentStatusBadge status={view.status} />
        </div>
        {view.status === 'completed' && view.result && <CopyButton text={view.result} label="Markdown 복사" />}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        {body}
      </div>
    </div>
  )
}
