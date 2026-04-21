import { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, session, isAdmin, signOut } = useAuth()
  const location = useLocation()
  const alertedRef = useRef(false)

  useEffect(() => {
    const run = async () => {
      if (loading) return
      if (!session) return
      if (isAdmin) return
      if (alertedRef.current) return

      alertedRef.current = true
      alert('관리자 권한이 없습니다')
      await signOut()
    }
    void run()
  }, [loading, session, isAdmin, signOut])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-600">
        로딩 중...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />
  }

  return children
}
