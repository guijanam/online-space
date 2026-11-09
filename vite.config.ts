import { defineConfig } from 'vitest/config'

// base: './' 로 상대 경로 빌드 → GitHub Pages(/<repo>/)든 커스텀 도메인이든 그대로 동작
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
