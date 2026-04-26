import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Users,
  Wrench,
  Rocket,
  FolderKanban,
  Star,
  Headphones,
} from 'lucide-react'
import type { NavigationPage } from '@/types'
import { useTranslation } from '@/i18n'

interface NavItemConfig {
  id: NavigationPage
  icon: React.ReactNode
  tooltipKey: string
  path: string
}

const navItems: NavItemConfig[] = [
  {
    id: 'dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    tooltipKey: 'nav.dashboard',
    path: '/',
  },
  {
    id: 'chat',
    icon: <MessageSquare className="w-5 h-5" />,
    tooltipKey: 'nav.chat',
    path: '/chat',
  },
  {
    id: 'workflow',
    icon: <GitBranch className="w-5 h-5" />,
    tooltipKey: 'nav.workflow',
    path: '/workflow',
  },
  {
    id: 'agents',
    icon: <Users className="w-5 h-5" />,
    tooltipKey: 'nav.agents',
    path: '/agents',
  },
  {
    id: 'projects',
    icon: <FolderKanban className="w-5 h-5" />,
    tooltipKey: 'nav.projects',
    path: '/projects',
  },
  {
    id: 'tools',
    icon: <Wrench className="w-5 h-5" />,
    tooltipKey: 'nav.tools',
    path: '/tools',
  },
  {
    id: 'apps',
    icon: <Rocket className="w-5 h-5" />,
    tooltipKey: 'nav.apps',
    path: '/apps',
  },
  {
    id: 'support',
    icon: <Headphones className="w-5 h-5" />,
    tooltipKey: 'nav.support',
    path: '/support',
  },
  {
    id: 'starred',
    icon: <Star className="w-5 h-5" />,
    tooltipKey: 'nav.starred',
    path: '/showcase',
  },
]

interface SidebarProps {
  onAvatarClick?: () => void
  isAdminMenuOpen?: boolean
}

export function Sidebar({ onAvatarClick, isAdminMenuOpen }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  const getActivePage = (): NavigationPage => {
    const path = location.pathname
    if (path === '/') return 'dashboard'
    if (path.startsWith('/chat')) return 'chat'
    if (path.startsWith('/workflow')) return 'workflow'
    if (path.startsWith('/agents')) return 'agents'
    if (path.startsWith('/projects')) return 'projects'
    if (path.startsWith('/tools')) return 'tools'
    if (path.startsWith('/apps')) return 'apps'
    if (path.startsWith('/support')) return 'support'
    if (path.startsWith('/starred') || path.startsWith('/showcase')) return 'starred'
    return 'dashboard'
  }

  const activePage = getActivePage()

  const handleNavigate = (path: string) => {
    navigate(path)
  }

  return (
    <aside className="w-16 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 gap-2">
      {/* Logo */}
      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
        <span className="text-white font-bold text-lg">S</span>
      </div>

      {/* Navigation Items */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = activePage === item.id
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.path)}
              className={`
                relative w-12 h-12 rounded-lg flex items-center justify-center
                transition-all duration-200 group
                ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }
              `}
              title={t(item.tooltipKey)}
            >
              {item.icon}
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-400 rounded-r-full" />
              )}
              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                {t(item.tooltipKey)}
              </div>
            </button>
          )
        })}
      </nav>

      {/* User Avatar at Bottom */}
      <div className="mt-auto pt-4 border-t border-gray-800">
        <button
          onClick={onAvatarClick}
          className={`
            w-10 h-10 rounded-full overflow-hidden
            transition-all duration-200
            hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 hover:ring-offset-gray-900
            ${isAdminMenuOpen ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900' : ''}
          `}
          title={t('sidebar.adminMenu')}
        >
          <img 
            src="https://api.dicebear.com/9.x/avataaars/svg?seed=Admin" 
            alt="User"
            className="w-full h-full object-cover"
          />
        </button>
      </div>
    </aside>
  )
}
