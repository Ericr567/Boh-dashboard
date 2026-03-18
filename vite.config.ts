import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep asset URLs relative so dist/index.html works from file:// and subfolders.
  base: './',
})
