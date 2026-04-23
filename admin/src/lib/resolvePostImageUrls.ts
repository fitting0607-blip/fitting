import { supabase } from './supabase'

const DEV = import.meta.env.DEV

function normalizeUrls(value: unknown): string[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0)
  }

  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return []

    // Some rows may store JSON as a string.
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw) as unknown
        return normalizeUrls(parsed)
      } catch {
        // fall through
      }
    }

    return [raw]
  }

  return []
}

export async function resolvePostImageUrls(imageUrls: unknown): Promise<string[]> {
  const list = normalizeUrls(imageUrls)
  if (list.length === 0) return []

  const resolved = await Promise.all(
    list.map(async (u) => {
      if (!u) return null
      if (u.startsWith('http://') || u.startsWith('https://')) return u

      const { data, error } = await supabase.storage
        .from('posts')
        .createSignedUrl(u, 60 * 60)
      if (DEV) {
        // eslint-disable-next-line no-console
        console.log('[admin][posts] createSignedUrl', {
          input: u,
          ok: !error && Boolean(data?.signedUrl),
          signedUrl: data?.signedUrl ?? null,
          error: error ? { message: error.message, name: (error as any).name } : null,
        })
      }
      if (!error && data?.signedUrl) return data.signedUrl

      const pub = supabase.storage.from('posts').getPublicUrl(u).data?.publicUrl
      if (DEV) {
        // eslint-disable-next-line no-console
        console.log('[admin][posts] getPublicUrl', { input: u, publicUrl: pub ?? null })
      }
      return pub || null
    }),
  )

  return resolved.filter(Boolean) as string[]
}

