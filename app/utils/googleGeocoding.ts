import Constants from 'expo-constants';

export type GeocodeResult = {
  latitude: number | null;
  longitude: number | null;
};

export function getGoogleMapsApiKey(): string | undefined {
  const envPlaces = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();
  if (envPlaces) return envPlaces;

  const envMaps = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (envMaps) return envMaps;

  const cfg = Constants.expoConfig as {
    ios?: { config?: { googleMapsApiKey?: string } };
    android?: { config?: { googleMaps?: { apiKey?: string } } };
  };
  const iosKey = typeof cfg?.ios?.config?.googleMapsApiKey === 'string' ? cfg.ios.config.googleMapsApiKey.trim() : '';
  if (iosKey) return iosKey;
  const androidKey =
    typeof cfg?.android?.config?.googleMaps?.apiKey === 'string' ? cfg.android.config.googleMaps.apiKey.trim() : '';
  if (androidKey) return androidKey;

  return undefined;
}

/** Google Geocoding API — 실패 시 null 좌표 반환 (throw 없음) */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (!trimmed) return { latitude: null, longitude: null };

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    console.warn('[geocode] missing Google Maps API key');
    return { latitude: null, longitude: null };
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(trimmed)}` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&language=ko` +
      `&region=kr`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[geocode] http error', res.status);
      return { latitude: null, longitude: null };
    }

    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };

    if (json.status !== 'OK' || !json.results?.length) {
      console.warn('[geocode] status', json.status ?? 'unknown');
      return { latitude: null, longitude: null };
    }

    const loc = json.results[0]?.geometry?.location;
    const lat = typeof loc?.lat === 'number' ? loc.lat : parseFloat(String(loc?.lat ?? ''));
    const lng = typeof loc?.lng === 'number' ? loc.lng : parseFloat(String(loc?.lng ?? ''));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { latitude: null, longitude: null };
    }

    return { latitude: lat, longitude: lng };
  } catch (e) {
    console.warn('[geocode] failed', e);
    return { latitude: null, longitude: null };
  }
}
