import { type Session, type User } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type AuthState = {
  session: Session | null
  user: User | null
  isAdmin: boolean
  loading: boolean
  refreshAdminStatus: (userId?: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await Promise.race([
    supabase.from('users').select('is_admin').eq('id', userId).maybeSingle(),
    new Promise<{ data: null; error: null }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: null }), 3000),
    ),
  ])

  if (error) return false
  return Boolean(data?.is_admin)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef<string | null>(null)
  const lastIsAdminRef = useRef<boolean>(false)

  const refreshAdminStatus = async (userId?: string): Promise<boolean> => {
    const resolvedUserId = userId ?? session?.user?.id
    if (!resolvedUserId) {
      setIsAdmin(false)
      return false
    }
    const admin = await Promise.race([
      fetchIsAdmin(resolvedUserId),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ])
    setIsAdmin(admin)
    return admin
  }

  useEffect(() => {
    let alive = true

    const init = async () => {
      console.log('[auth] init start')
      console.log('[auth] supabase url:', import.meta.env.VITE_SUPABASE_URL)
      setLoading(true)
      try {
        const { data } = (await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 3000),
          ),
        ])) as { data: { session: Session | null } }
        console.log('[auth] getSession result:', data)
        if (!alive) return

        const nextSession = data.session ?? null
        const nextUserId = nextSession?.user?.id ?? null

        setSession(nextSession)
        lastUserIdRef.current = nextUserId

        if (nextUserId) {
          const admin = await fetchIsAdmin(nextUserId)
          if (!alive) return
          setIsAdmin(admin)
          lastIsAdminRef.current = admin
        } else {
          setIsAdmin(false)
          lastIsAdminRef.current = false
        }
      } finally {
        // Ensure loading is cleared even if init bails early.
        // (React may warn if unmounted; we accept that to guarantee state clears.)
        console.log('[auth] loading done')
        setLoading(false)
      }
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!alive) return
      const nextUserId = nextSession?.user?.id ?? null

      setSession(nextSession)

      // After init, don't touch loading. Also avoid needless admin refetches
      // when the user hasn't changed (e.g. token refresh / app focus changes).
      if (!nextUserId) {
        setIsAdmin(false)
        lastUserIdRef.current = null
        lastIsAdminRef.current = false
        return
      }

      if (lastUserIdRef.current === nextUserId) {
        return
      }

      lastUserIdRef.current = nextUserId
      const admin = await fetchIsAdmin(nextUserId)
      if (!alive) return
      setIsAdmin(admin)
      lastIsAdminRef.current = admin
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isAdmin,
      loading,
      refreshAdminStatus,
      signOut,
    }),
    [session, isAdmin, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
