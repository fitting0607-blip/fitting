import { Outlet } from 'react-router-dom'
import { SidebarNav } from '../nav/SidebarNav'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-4">
          <div className="text-sm font-semibold">Fitting Admin</div>
          <div className="mt-1 text-xs text-neutral-500">관리자 콘솔</div>
        </div>
        <SidebarNav />
      </aside>

      <main className="min-w-0 flex-1">
        <div className="border-b border-neutral-200 bg-white px-6 py-4">
          <div className="text-sm text-neutral-500">Admin</div>
        </div>
        <div className="px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
