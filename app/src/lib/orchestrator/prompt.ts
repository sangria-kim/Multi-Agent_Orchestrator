// 노션 6장의 4단 구조를 여기 하나에서 조립한다. Provider별 차이는 Adapter의 CLI
// 플래그로만 흡수하고, 프롬프트 본문은 절대 건드리지 않는다.
//
// 다른 Agent의 결과를 참고하지 말라는 문구는 넣지 않는다. 애초에 전달되지 않으므로
// 불필요하고, 존재하지 않는 맥락을 암시해 출력을 오염시킬 수 있다. 같은 이유로 Agent
// 이름이나 Agent 수도 프롬프트에 넣지 않는다.

const BASE_INSTRUCTION = `당신은 아래 요청에 대한 결과물을 작성하는 Agent입니다. 요청 내용만 보고 스스로 판단하여 독립적으로 작업하세요. 추가로 확인할 것이 있어도 질문하지 말고, 지금 가진 정보로 최선의 결과물을 완성하세요.`

const OUTPUT_REQUIREMENTS = `## 출력 형식

- 결과 전체를 마크다운으로 작성하세요.
- 적절한 제목(heading)으로 섹션을 구분하세요. 섹션 이름과 개수는 자유롭게 정하세요.
- 중간 진행 상황이나 확인 질문 없이, 완성된 문서 전체를 한 번에 출력하세요.`

export interface BuildPromptInput {
  request: string
  context?: string | null
}

export function buildPrompt({ request, context }: BuildPromptInput): string {
  const sections = [BASE_INSTRUCTION, `## 요청\n\n${request.trim()}`]

  const trimmedContext = context?.trim()
  if (trimmedContext) {
    sections.push(`## 추가 Context\n\n${trimmedContext}`)
  }

  sections.push(OUTPUT_REQUIREMENTS)
  return sections.join('\n\n')
}
