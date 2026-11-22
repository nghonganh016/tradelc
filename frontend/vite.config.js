import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cấu hình Vite tối giản: chỉ cần plugin React
export default defineConfig({
  plugins: [react()],
})
