// 마크다운 헤딩만 뽑는다. remark로 파싱할 것도 없이 정규식으로 충분하다
// (02-phase2-web-ui.md: 섹션 비교). 코드 블록 안의 #만 제외한다.
export function extractHeadings(markdown: string): string[] {
  const headings: string[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (match) headings.push(match[1].trim())
  }
  return headings
}

export interface SectionRow {
  heading: string
  present: boolean[]
}

// 같은 이름의 헤딩은 같은 행에, 한쪽에만 있으면 반대쪽을 비운다. 순수 문자열 비교만
// 한다 — 의미가 같아도 이름이 다르면 묶지 않는다 (원칙 3: No Judgment by Tool).
export function compareSections(headingLists: string[][]): SectionRow[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const headings of headingLists) {
    for (const heading of headings) {
      if (!seen.has(heading)) {
        seen.add(heading)
        order.push(heading)
      }
    }
  }
  return order.map((heading) => ({
    heading,
    present: headingLists.map((headings) => headings.includes(heading)),
  }))
}
