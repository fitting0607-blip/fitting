import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Constants, { AppOwnership } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { attachNotificationResponseHandler, ensureExpoNotificationHandlerInstalled, registerAndSavePushToken } from '@/app/utils/push';
import { MatchCompleteAlertHost } from '@/app/matchCompleteAlert';
import { PurchaseCompleteAlertHost } from '@/iap/purchaseCompleteAlert';
import {
  CAN_USE_NATIVE_IAP,
  initConnection as initRniapConnection,
  startListeners as startRniapListeners,
  stopListeners as stopRniapListeners,
  endConnection as endRniapConnection,
  isIapPurchaseFlowActive,
  subscribeIapPurchaseFlowChange,
} from '@/iap/rniap';
import { recoverSupabaseSession } from '@/lib/supabaseSession';
import { supabase } from '../supabase';
import SplashScreen from './splash';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [sessionRecovering, setSessionRecovering] = useState(false);
  const [iapFlowRevision, setIapFlowRevision] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const sessionRecoveringRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Ensure Google Mobile Ads SDK is initialized on app start (skip Expo Go — no native module).
    if (Constants.appOwnership !== AppOwnership.Expo) {
      void import('react-native-google-mobile-ads')
        .then(({ default: MobileAds }) => MobileAds().initialize().catch(() => null))
        .catch(() => null);
    }

    // Expo Go: react-native-iap / NitroModules 없음 — Dev Client·스토어 빌드에서만 IAP 초기화
    if (CAN_USE_NATIVE_IAP) {
      void (async () => {
        try {
          await initRniapConnection();
        } catch (e: unknown) {
          console.error('[RNIAP] init/listeners error in RootLayout', e);
        } finally {
          // best-effort: even if init fails, keep listeners registered
          // (replay events should be silently ignored without auth session)
          startRniapListeners();
        }
      })();
    }

    try {
      ensureExpoNotificationHandlerInstalled();
    } catch {
      // best-effort: never crash app on startup
    }

    void (async () => {
      sessionRecoveringRef.current = true;
      setSessionRecovering(true);
      try {
        const ok = await recoverSupabaseSession();
        if (!mounted) return;
        setHasSession(ok);
      } catch {
        if (!mounted) return;
        setHasSession(false);
      } finally {
        sessionRecoveringRef.current = false;
        if (mounted) {
          setSessionRecovering(false);
          setIsReady(true);
        }
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (sessionRecoveringRef.current && !session) return;
      setHasSession(Boolean(session));
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      // best-effort cleanup
      stopRniapListeners();
      void endRniapConnection();
    };
  }, []);

  useEffect(() => {
    // (best-effort) register push token once we have a session
    if (!hasSession) return;
    registerAndSavePushToken().catch(() => null);
  }, [hasSession]);

  useEffect(() => {
    return subscribeIapPurchaseFlowChange(() => {
      setIapFlowRevision((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      sessionRecoveringRef.current = true;
      setSessionRecovering(true);
      void recoverSupabaseSession()
        .then((ok) => {
          setHasSession(ok);
        })
        .catch(() => {
          setHasSession(false);
        })
        .finally(() => {
          sessionRecoveringRef.current = false;
          setSessionRecovering(false);
        });
    });

    return () => sub.remove();
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (showSplash) return;
    if (sessionRecovering) return;
    if (hasSession) return;
    if (isIapPurchaseFlowActive()) return;

    const first = segments[0];
    const onAuthScreen =
      first === '(auth)' || first === 'login' || first === 'register';
    if (onAuthScreen) return;

    router.replace('/login');
  }, [isReady, showSplash, sessionRecovering, hasSession, segments, router, iapFlowRevision]);

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

  if (!isReady) return null;

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
        <Stack.Screen name="gathering" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
        <Stack.Screen name="block-list" options={{ headerShown: false }} />
        <Stack.Screen name="trainer-detail" options={{ headerShown: false }} />
        <Stack.Screen name="trainer-apply" options={{ headerShown: false }} />
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {showSplash ? (
        <View style={styles.splashOverlay} pointerEvents="auto">
          <SplashScreen onFinish={() => setShowSplash(false)} />
        </View>
      ) : null}
      <StatusBar style="auto" />
      <PurchaseCompleteAlertHost />
      <MatchCompleteAlertHost />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
});
