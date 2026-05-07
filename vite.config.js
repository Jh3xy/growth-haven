import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  // We keep the root at '.' so it sees your main index.html
  root: ".",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "src/admin/index.html"),
        login: resolve(__dirname, "src/login/index.html"),
        terms: resolve(__dirname, "src/terms/index.html"),
        privacy: resolve(__dirname, "src/privacy/index.html"),
        recover: resolve(__dirname, "src/recover/index.html"),
        register: resolve(__dirname, "src/register/index.html"),
        dashboard: resolve(__dirname, "src/dashboard/index.html"),
        affiliate: resolve(__dirname, "src/affiliate/index.html"),
        post: resolve(__dirname, "src/post/index.html"),
        casino: resolve(__dirname, "src/casino/index.html"),
        mines: resolve(__dirname, "src/casino/mines/index.html"),
        dice: resolve(__dirname, "src/casino/dice/index.html"),
        limbo: resolve(__dirname, "src/casino/limbo/index.html"),
        plinko: resolve(__dirname, "src/casino/plinko/index.html"),
        "coin-flip": resolve(__dirname, "src/casino/coin-flip/index.html"),
      },
    },
  },
});