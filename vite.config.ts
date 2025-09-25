import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react()],
      define: {
        // 为了兼容性，保留旧的环境变量映射，但推荐使用 VITE_ 前缀
        'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.OPENROUTER_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
