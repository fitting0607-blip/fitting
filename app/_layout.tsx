import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Constants, { AppOwnership } from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { attachNotificationResponseHandler, ensureExpoNotificationHandlerInstalled, registerAndSavePushToken } from '@/app/utils/push';
import { PurchaseCompleteAlertHost } from '@/iap/purchaseCompleteAlert';
import {
  initConnection as initRniapConnection,
  startListeners as startRniapListeners,
  stopListeners as stopRniapListeners,
  endConnection as endRniapConnection,
  isIapPurchaseFlowActive,
  subscribeIapPurchaseFlowChange,
} from '@/iap/rniap';
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
  const [iapFlowRevision, setIapFlowRevision] = useState(0);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Ensure Google Mobile Ads SDK is initialized on app start (skip Expo Go — no native module).
    if (Constants.appOwnership !== AppOwnership.Expo) {
      void import('react-native-google-mobile-ads')
        .then(({ default: MobileAds }) => MobileAds().initialize().catch(() => null))
        .catch(() => null);
    }

    // Expo Go: react-native-iap / NitroModules 없음 — rniap은 로드만 되어도 네이티브 접근 없음, 여기선 초기화 생략
    if (Platform.OS === 'ios' && Constants.appOwnership !== AppOwnership.Expo) {
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
    if (showSplash) return;
    if (hasSession) return;
    if (isIapPurchaseFlowActive()) return;

    const first = segments[0];
    const onAuthScreen =
      first === '(auth)' || first === 'login' || first === 'register';
    if (onAuthScreen) return;

    router.replace('/login');
  }, [isReady, showSplash, hasSession, segments, router, iapFlowRevision]);

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
