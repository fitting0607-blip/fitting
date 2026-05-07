import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import MobileAds from 'react-native-google-mobile-ads';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { attachNotificationResponseHandler, ensureExpoNotificationHandlerInstalled, registerAndSavePushToken } from '@/app/utils/push';
import { initConnection as initRniapConnection, startListeners as startRniapListeners, endConnection as endRniapConnection } from '@/iap/rniap';
import { supabase } from '../supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Ensure Google Mobile Ads SDK is initialized on app start.
    // This prevents startup crash: GADApplicationVerifyPublisherInitializedCorrectly
    MobileAds()
      .initialize()
      .catch(() => null);

    if (Platform.OS === 'ios') {
      void (async () => {
        try {
          await initRniapConnection();
          startRniapListeners();
        } catch (e: unknown) {
          console.error('[RNIAP] init/listeners error in RootLayout', e);
        }
      })();
    }

    try {
      ensureExpoNotificationHandlerInstalled();
    } catch {
      // best-effort: never crash app on startup
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setHasSession(Boolean(data.session));
        setIsReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setHasSession(false);
        setIsReady(true);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      // best-effort cleanup
      void endRniapConnection();
    };
  }, []);

  useEffect(() => {
    // (best-effort) register push token once we have a session
    if (!hasSession) return;
    registerAndSavePushToken().catch(() => null);
  }, [hasSession]);

  useEffect(() => {
    // handle notification taps
    const detach = attachNotificationResponseHandler((route) => {
      try {
        router.push(route as any);
      } catch {
        // ignore
      }
    });
    return detach;
  }, [router]);

  const inAuthGroup = segments[0] === '(auth)';

  if (!isReady) return null;
  if (!hasSession && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="post-create" options={{ headerShown: false }} />
        <Stack.Screen name="post-detail" options={{ headerShown: false }} />
        <Stack.Screen name="user-profile" options={{ headerShown: false }} />
        <Stack.Screen name="chat-room" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
        <Stack.Screen name="block-list" options={{ headerShown: false }} />
        <Stack.Screen name="trainer-detail" options={{ headerShown: false }} />
        <Stack.Screen name="trainer-apply" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
