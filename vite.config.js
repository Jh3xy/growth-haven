

import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main:      resolve(__dirname, 'index.html'),
        login:     resolve(__dirname, 'src/login.html'),
        register:  resolve(__dirname, 'src/register.html'),
        recover:   resolve(__dirname, 'src/recover.html'),
        dashboard: resolve(__dirname, 'src/dashboard.html'),
      }
    }
  }
})

