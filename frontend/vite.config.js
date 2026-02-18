import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/azproxy': {
        target: 'https://prices.azure.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          // /azproxy?foo=bar  =>  /api/retail/prices?foo=bar
          const queryIndex = path.indexOf('?');
          const query = queryIndex >= 0 ? path.substring(queryIndex) : '';
          return '/api/retail/prices' + query;
        },
      },
    },
  },
})
