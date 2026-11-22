import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  envDir: false, plugins: [{ name: 'isolated-receipt-database', enforce: 'pre', resolveId(id) {
    if (/(?:^|\/)supabaseClient(?:\.tsx?)?$/.test(id)) return path.resolve('tests/receipt-preview/client.ts');
    return undefined;
  } }, react()],
  server: { host: '127.0.0.1', port: 3022, strictPort: true, fs: { allow: [path.resolve('.')] },
    proxy: { '/api': 'http://127.0.0.1:3023' } },
});
