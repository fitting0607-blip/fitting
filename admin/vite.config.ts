import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const adminEnv = loadEnv(mode, __dirname, '')

  const supabaseUrl =
    adminEnv.VITE_SUPABASE_URL ??
    repoRootEnv.EXPO_PUBLIC_SUPABASE_URL ??
    repoRootEnv.VITE_SUPABASE_URL

  const supabaseAnonKey =
    adminEnv.VITE_SUPABASE_ANON_KEY ??
    repoRootEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    repoRootEnv.VITE_SUPABASE_ANON_KEY

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey ?? ''),
    },
  }
})
