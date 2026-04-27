import 'dotenv/config';

import type { ExpoConfig } from 'expo/config';

// Keep app.json as the source of truth for non-secret settings,
// but override sensitive keys from environment variables.
const base = require('./app.json') as { expo: ExpoConfig };

const config: ExpoConfig = {
  ...base.expo,
  ios: {
    ...(base.expo.ios ?? {}),
    infoPlist: {
      ...((base.expo.ios as any)?.infoPlist ?? {}),
      ITSAppUsesNonExemptEncryption: false,
    },
    googleMapsApiKey:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? (base.expo.ios as any)?.googleMapsApiKey,
  },
  android: {
    ...(base.expo.android ?? {}),
    googleMaps: {
      ...((base.expo.android as any)?.googleMaps ?? {}),
      apiKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
        (base.expo.android as any)?.googleMaps?.apiKey,
    },
  },
  extra: {
    ...(base.expo.extra ?? {}),
    eas: {
      projectId: 'c58d31bb-552c-41a7-832d-ba38f73387f8',
    },
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    EXPO_PUBLIC_GOOGLE_PLACES_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
    EXPO_PUBLIC_KAKAO_REST_API_KEY: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
    EXPO_PUBLIC_KAKAO_CLIENT_SECRET: process.env.EXPO_PUBLIC_KAKAO_CLIENT_SECRET,
  },
};

export default config;

