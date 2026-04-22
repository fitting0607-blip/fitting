import { NavLink } from 'react-router-dom'

type NavItem =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'section'; label: string }

const items: NavItem[] = [
  { kind: 'link', to: '/dashboard', label: '대시보드' },
  { kind: 'link', to: '/users', label: '유저목록' },
  { kind: 'link', to: '/feed', label: '피드 관리' },
  { kind: 'link', to: '/trainers', label: '피티유저' },
  { kind: 'link', to: '/reports', label: '신고목록' },
  { kind: 'section', label: '결제 관리' },
  { kind: 'link', to: '/payments', label: '결제 정보 관리' },
  { kind: 'link', to: '/products', label: '상품관리' },
  { kind: 'link', to: '/banners', label: '배너관리' },
  { kind: 'link', to: '/terms', label: '약관관리' },
]

export function SidebarNav() {
  return (
    <nav className="p-2">
      {items.map((item, idx) =>
        item.kind === 'section' ? (
          <div
            key={`section-${item.label}-${idx}`}
            className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-neutral-400"
          >
            {item.label}
          </div>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'block rounded-md px-3 py-2 text-sm',
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  )
}
