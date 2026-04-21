import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, isAdmin, loading, refreshAdminStatus, signOut } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) return
    if (!isAdmin) return

    const from = (location.state as { from?: Location } | null)?.from
    const nextPath = typeof from?.pathname === 'string' ? from.pathname : '/users'
    navigate(nextPath, { replace: true })
  }, [loading, session, isAdmin, location.state, navigate])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        alert(error.message)
        return
      }

      const ok = data.session ? await refreshAdminStatus(data.session.user.id) : false
      if (!ok) {
        alert('관리자 권한이 없습니다')
        await signOut()
        return
      }

      navigate('/users', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  const onDevSignOut = async () => {
    await signOut()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">관리자 로그인</div>
        <div className="mt-1 text-sm text-neutral-500">관리자 계정만 접근 가능합니다.</div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-neutral-700">이메일</label>
            <input
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none ring-neutral-900/10 focus:ring-4"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700">비밀번호</label>
            <input
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none ring-neutral-900/10 focus:ring-4"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-neutral-500">{session ? '세션 있음' : '세션 없음'}</div>
          <button
            type="button"
            onClick={onDevSignOut}
            className="text-xs text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}

