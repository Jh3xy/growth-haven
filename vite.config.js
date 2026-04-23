import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  // We keep the root at '.' so it sees your main index.html
  root: '.', 
  build: {
    rollupOptions: {
      input: {
        main:      resolve(__dirname, 'index.html'),
        admin:     resolve(__dirname, 'src/admin/index.html'),
        login:     resolve(__dirname, 'src/login/index.html'),
        register:  resolve(__dirname, 'src/register/index.html'),
        recover:  resolve(__dirname, 'src/recover/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
        terms: resolve(__dirname, 'src/terms/index.html'),
        affiliate: resolve(__dirname, 'src/affiliate/index.html'),
        privacy: resolve(__dirname, 'src/privacy/index.html'),
      }
    }
  }
})