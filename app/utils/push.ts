import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/supabase';

type RoutePayload = { pathname: string; params?: Record<string, string> };

function getEasProjectId(): string | null {
  const extra: any = Constants.expoConfig?.extra ?? Constants.easConfig?.extra ?? {};
  const pid = extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  return typeof pid === 'string' && pid.trim() ? pid.trim() : null;
}

export function ensureExpoNotificationHandlerInstalled() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    // best-effort: never crash app on startup
  }
}

export async function registerAndSavePushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6C47FF',
      });
    }

    const projectId = getEasProjectId();
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const expoPushToken = token.data;
    if (!expoPushToken) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return expoPushToken;

    // Save only if changed
    const { data: me } = await supabase.from('users').select('fcm_token').eq('id', user.id).maybeSingle();
    const prevToken = typeof (me as any)?.fcm_token === 'string' ? String((me as any).fcm_token) : '';
    if (prevToken === expoPushToken) return expoPushToken;

    await supabase.from('users').update({ fcm_token: expoPushToken }).eq('id', user.id);
    return expoPushToken;
  } catch {
    return null;
  }
}

export function attachNotificationResponseHandler(onRoute: (route: RoutePayload) => void) {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data ?? {};
      const route = data?.route as RoutePayload | undefined;
      if (!route?.pathname) return;
      onRoute(route);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

