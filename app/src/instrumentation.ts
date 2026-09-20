// 서버가 뜰 때 한 번 호출된다. hookShutdown()을 여기서 등록하지 않으면 진행 중인
// CLI 프로세스가 서버 종료 시 정리되지 않고 고아로 남는다 (02-phase2-web-ui.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { hookShutdown } = await import('@/lib/orchestrator/runner')
    hookShutdown()
  }
}
