import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, ChevronUp, ChevronDown, Sun, Moon, Monitor } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { AdminMenu } from './AdminMenu'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/services/AuthContext'
import { shouldUseRestApi } from '@/services/api/index'
import { useTheme } from '@/services/ThemeContext'

interface AppShellProps {
  children: ReactNode
}

// Map routes to page titles
const getPageTitle = (pathname: string, t: (key: string) => string): string => {
  if (pathname === '/') return t('header.commandCenter')
  if (pathname.startsWith('/chat')) return t('nav.chat')
  if (pathname.startsWith('/workflow')) return t('nav.workflow')
  if (pathname.startsWith('/agents')) return t('nav.agents')
  if (pathname.startsWith('/tools')) return t('nav.tools')
  if (pathname.startsWith('/apps')) return t('nav.apps')
  if (pathname.startsWith('/support')) return t('nav.support')
  if (pathname.startsWith('/tasks')) return t('nav.tasks')
  if (pathname.startsWith('/task-monitoring')) return t('taskExecution.title')
  return t('header.commandCenter')
}

export function AppShell({ children }: AppShellProps) {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false)
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const isRestMode = shouldUseRestApi()
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
    setTheme(next)
  }

  const themeIcon = theme === 'dark' ? <Moon className="w-4 h-4" /> : theme === 'light' ? <Sun className="w-4 h-4" /> : <Monitor className="w-4 h-4" />
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'

  const pageTitle = getPageTitle(location.pathname, t)

  const toggleAdminMenu = () => {
    setIsAdminMenuOpen((prev) => !prev)
  }

  const closeAdminMenu = () => {
    setIsAdminMenuOpen(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar Navigation */}
      <Sidebar 
        onAvatarClick={toggleAdminMenu}
        isAdminMenuOpen={isAdminMenuOpen}
      />

      {/* Admin Menu Popup - positioned relative to sidebar */}
      <AdminMenu isOpen={isAdminMenuOpen} onClose={closeAdminMenu} />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top Bar */}
        {isHeaderCollapsed ? (
          <div className="h-8 bg-gray-900/85 border-b border-white/[0.08] flex items-center justify-end px-4">
            <button
              onClick={() => setIsHeaderCollapsed(false)}
              className="p-0.5 text-slate-500 hover:text-white rounded transition-colors"
              title="Expand header"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <header className="h-[70px] bg-gray-900/85 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between px-8">
            {/* Left: Title */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold tracking-tight">{pageTitle}</h1>
            </div>

            {/* Right: User info, logout, and collapse */}
            <div className="flex items-center gap-4">
              {isRestMode && user && (
                <>
                  <div className="text-sm text-slate-400">
                    <span className="text-white font-medium">{user.name}</span>
                    <span className="mx-2">•</span>
                    <span>{user.organizationName}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              )}
              <button
                onClick={cycleTheme}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={`Theme: ${themeLabel} (click to cycle)`}
              >
                {themeIcon}
                <span className="text-xs">{themeLabel}</span>
              </button>
              <button
                onClick={() => setIsHeaderCollapsed(true)}
                className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                title="Collapse header"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  )
}
