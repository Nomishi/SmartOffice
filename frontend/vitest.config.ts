import { defineConfig } from 'vitest/config';

// Test chạy bằng Node, không cần trình duyệt. Mock bật sẵn để test lớp API đi qua backend giả.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { VITE_USE_MOCK: 'true' },
  },
});
