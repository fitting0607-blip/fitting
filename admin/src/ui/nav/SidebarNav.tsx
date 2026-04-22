import { NavLink } from 'react-router-dom'

type NavItem =
  | { kind: 'link'; to: string; label: string }
  | { kind: 'section'; label: string }

const items: NavItem[] = [
  { kind: 'section', label: '대시보드' },
  { kind: 'link', to: '/dashboard', label: '대시보드' },

  { kind: 'section', label: '유저 관리' },
  { kind: 'link', to: '/users', label: '유저목록' },
  { kind: 'link', to: '/feed', label: '피드 관리' },
  { kind: 'link', to: '/trainers', label: '피티유저' },

  { kind: 'section', label: '고객 센터' },
  { kind: 'link', to: '/reports', label: '신고목록' },

  { kind: 'section', label: '결제 관리' },
  { kind: 'link', to: '/payments', label: '결제 정보 관리' },
  { kind: 'link', to: '/products', label: '상품관리' },

  { kind: 'section', label: '콘텐츠' },
  { kind: 'link', to: '/banners', label: '배너관리' },
  { kind: 'link', to: '/terms', label: '약관관리' },
]

export function SidebarNav() {
  return (
    <nav className="px-3 py-2">
      {items.map((item, idx) =>
        item.kind === 'section' ? (
          <div
            key={`section-${item.label}-${idx}`}
            className={[
              'px-2 pb-2 text-[11px] font-semibold tracking-wide text-neutral-400',
              idx === 0 ? 'pt-2' : 'pt-5',
            ].join(' ')}
          >
            {item.label}
          </div>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'my-0.5 block rounded-md px-2 py-2.5 text-sm',
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
