import { type Session, type User } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) return false
  return Boolean(data?.is_admin)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const refreshAdminStatus = async (userId?: string): Promise<boolean> => {
    const resolvedUserId = userId ?? session?.user?.id
    if (!resolvedUserId) {
      setIsAdmin(false)
      return false
    }
    const admin = await fetchIsAdmin(resolvedUserId)
    setIsAdmin(admin)
    return admin
  }

  useEffect(() => {
    let alive = true

    const init = async () => {
      setLoading(true)
      const { data } = await supabase.auth.getSession()
      if (!alive) return

      setSession(data.session ?? null)
      if (data.session?.user?.id) {
        const admin = await fetchIsAdmin(data.session.user.id)
        if (!alive) return
        setIsAdmin(admin)
      } else {
        setIsAdmin(false)
      }
      setLoading(false)
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!alive) return
      setSession(nextSession)
      if (nextSession?.user?.id) {
        setLoading(true)
        const admin = await fetchIsAdmin(nextSession.user.id)
        if (!alive) return
        setIsAdmin(admin)
        setLoading(false)
      } else {
        setIsAdmin(false)
      }
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
