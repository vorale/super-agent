import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TranslationProvider } from '@/i18n'
import { AppShell, ErrorBoundary, ToastProvider, ProtectedRoute, SkillMarketplaceBrowser, AIScopeGenerator, SkillWorkshop } from '@/components'
import { Dashboard, Chat, WorkflowEditor, Agents, Tools, AgentConfigurator, TaskAuditLog, TaskExecutionCenter, MCPConfigurator, KnowledgeManager, InfrastructureConfigurator, Login, CreateBusinessScope, Marketplace, AppRunner } from '@/pages'
import { StarredSessions } from '@/pages/StarredSessions'
import { ShowcasePage } from '@/pages/ShowcasePage'
import { Settings } from '@/pages/Settings'
import { AuthCallback } from '@/pages/AuthCallback'
import { InviteAccept } from '@/pages/InviteAccept'
import { ChatRoomPage } from '@/pages/ChatRoomPage'
import { DigitalTwinWizard } from '@/pages/DigitalTwinWizard'
import { Projects } from '@/pages/Projects'
import { ProjectBoard } from '@/pages/ProjectBoard'
import { SupportWorkspace } from '@/pages/SupportWorkspace'
import { SupportSettings } from '@/pages/SupportSettings'
import { SupportAnalytics } from '@/pages/SupportAnalytics'
import { SupportKnowledge } from '@/pages/SupportKnowledge'
import { AuthProvider } from '@/services/AuthContext'
import { ThemeProvider } from '@/services/ThemeContext'
import { useTranslation } from '@/i18n'

function AppContent() {
  const { t } = useTranslation()
  return (
    <Routes>
      {/* Full-page routes without AppShell */}
      <Route path="/create-business-scope" element={<CreateBusinessScope />} />
      <Route path="/create-business-scope/ai" element={<AIScopeGenerator />} />
      <Route path="/agents/config/:agentId/workshop" element={<SkillWorkshop />} />
      <Route path="/create-digital-twin" element={<DigitalTwinWizard />} />
      
      {/* Routes with AppShell */}
      <Route path="/*" element={
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/room/:roomId" element={<ChatRoomPage />} />
            <Route path="/workflow" element={<WorkflowEditor />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/config/:agentId" element={<AgentConfigurator />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectBoard />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/tasks" element={<TaskAuditLog />} />
            <Route path="/task-monitoring" element={<TaskExecutionCenter />} />
            {/* Config routes - placeholder for admin menu navigation */}
            <Route path="/config/mcp" element={<MCPConfigurator />} />
            <Route path="/config/skills" element={<SkillMarketplaceBrowser />} />
            <Route path="/config/rest-api" element={<div className="p-6 text-white">{t('config.restApi')}</div>} />
            <Route path="/config/knowledge" element={<KnowledgeManager />} />
            <Route path="/config/framework" element={<InfrastructureConfigurator />} />
            <Route path="/apps" element={<Marketplace />} />
            <Route path="/apps/:id" element={<AppRunner />} />
            <Route path="/support" element={<SupportWorkspace />} />
            <Route path="/support/settings" element={<SupportSettings />} />
            <Route path="/support/analytics" element={<SupportAnalytics />} />
            <Route path="/support/knowledge" element={<SupportKnowledge />} />
            <Route path="/starred" element={<StarredSessions />} />
            <Route path="/showcase" element={<ShowcasePage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AppShell>
      } />
    </Routes>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <TranslationProvider>
            <ToastProvider>
              <AuthProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/invite/:token" element={<InviteAccept />} />
                  <Route path="/*" element={
                    <ProtectedRoute>
                      <AppContent />
                    </ProtectedRoute>
                  } />
                </Routes>
              </AuthProvider>
            </ToastProvider>
          </TranslationProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
