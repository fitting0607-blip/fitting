import { NavLink } from 'react-router-dom'

const items = [
  { to: '/users', label: '유저목록' },
  { to: '/trainers', label: '피티유저' },
  { to: '/reports', label: '신고목록' },
  { to: '/products', label: '상품관리' },
  { to: '/banners', label: '배너관리' },
  { to: '/terms', label: '약관관리' },
] as const

export function SidebarNav() {
  return (
    <nav className="p-2">
      {items.map((item) => (
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
      ))}
    </nav>
  )
}
