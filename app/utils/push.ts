import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { NotificationBehavior } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/supabase';

type RoutePayload = { pathname: string; params?: Record<string, string> };

function readRecordString(obj: unknown, key: string): string | null {
  if (obj === null || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function getEasProjectId(): string | null {
  const expoExtra = Constants.expoConfig?.extra;
  const easObj =
    expoExtra !== null && typeof expoExtra === 'object'
      ? (expoExtra as Record<string, unknown>)['eas']
      : undefined;
  const pidFromNested =
    easObj !== null && typeof easObj === 'object'
      ? readRecordString(easObj, 'projectId')
      : null;
  const pid =
    pidFromNested ??
    (typeof Constants.easConfig?.projectId === 'string' ? Constants.easConfig.projectId.trim() : null);
  return pid && pid.length > 0 ? pid : null;
}

export function ensureExpoNotificationHandlerInstalled() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (): Promise<NotificationBehavior> => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
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
    type UserTokenRow = { fcm_token?: string | null };
    const row = me as UserTokenRow | null;
    const prevToken = typeof row?.fcm_token === 'string' ? row.fcm_token : '';
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
      const dataRaw = response?.notification?.request?.content?.data;
      const data =
        dataRaw !== null && typeof dataRaw === 'object' ? (dataRaw as Record<string, unknown>) : {};
      const route = data.route;
      if (
        route === null ||
        typeof route !== 'object' ||
        typeof (route as { pathname?: unknown }).pathname !== 'string'
      ) {
        return;
      }
      onRoute(route as RoutePayload);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

