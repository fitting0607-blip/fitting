import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

type AppExtra = Record<string, unknown> & {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

function getExtra(): AppExtra {
  // Expo SDK 49+ (and EAS builds) expose `expoConfig.extra` reliably.
  const extra = (Constants.expoConfig?.extra ?? Constants.easConfig?.extra ?? {}) as AppExtra;
  return extra;
}

export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const extra = getExtra();

  const url = (extra.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const anonKey = (extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

const supabaseEnv = getSupabaseEnv();

if (!supabaseEnv) {
  // eslint-disable-next-line no-console
  console.warn(
    '[app] Missing Supabase env. Expected EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (via app.config.ts extra / EAS env).',
  );
}

// Avoid passing an empty URL which can crash on startup in some environments.
export const supabase = createClient(
  supabaseEnv?.url ?? 'https://invalid.supabase.co',
  supabaseEnv?.anonKey ?? 'invalid-anon-key',
);
