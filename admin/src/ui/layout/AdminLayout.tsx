import { Outlet } from 'react-router-dom'
import { SidebarNav } from '../nav/SidebarNav'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white min-h-screen max-h-screen">
        <div className="shrink-0 border-b border-neutral-200 px-4 py-4">
          <div className="text-sm font-semibold">Fitting Admin</div>
          <div className="mt-1 text-xs text-neutral-500">관리자 콘솔</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
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
