import Constants from 'expo-constants';
import * as React from 'react';
import { Platform } from 'react-native';

type AppleAuthModule = typeof import('expo-apple-authentication');

function canUseNativeAppleAuth() {
  // Expo Go should not load native AppleAuth modules.
  // Standalone / dev-client iOS builds can.
  if (Platform.OS !== 'ios') return false;
  if ((Constants as any)?.appOwnership === 'expo') return false;
  return true;
}

function loadAppleAuthModule(): AppleAuthModule | null {
  if (!canUseNativeAppleAuth()) return null;
  try {
    // Use runtime require so Expo Go never evaluates the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication') as AppleAuthModule;
  } catch {
    return null;
  }
}

export async function isAppleAuthAvailable(): Promise<boolean> {
  const mod = loadAppleAuthModule();
  if (!mod) return false;
  try {
    return Boolean(await mod.isAvailableAsync());
  } catch {
    return false;
  }
}

export async function signInWithApple(params: { nonce: string }) {
  const mod = loadAppleAuthModule();
  if (!mod) throw new Error('Apple 로그인은 iOS 네이티브 빌드에서만 사용할 수 있어요.');
  return await mod.signInAsync({
    requestedScopes: [mod.AppleAuthenticationScope.FULL_NAME, mod.AppleAuthenticationScope.EMAIL],
    nonce: params.nonce,
  });
}

export const AppleSignInButton: React.ComponentType<
  React.ComponentProps<any> & { onPress: () => void; style?: any }
> = (props: any) => {
  const mod = loadAppleAuthModule();
  if (!mod) return null;
  // Avoid JSX here to keep this file valid .ts (not .tsx)
  return React.createElement(mod.AppleAuthenticationButton as any, {
    buttonType: mod.AppleAuthenticationButtonType.SIGN_IN,
    buttonStyle: mod.AppleAuthenticationButtonStyle.BLACK,
    cornerRadius: 12,
    ...props,
  });
};

