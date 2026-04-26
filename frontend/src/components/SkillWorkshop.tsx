/**
 * SkillWorkshop Component
 *
 * Split-pane UI for live skill testing on an agent:
 * - Left pane: Chat with the agent
 * - Right pane: Skill browser (installed + marketplace) with equip/unequip
 *
 * Equipped skills are temporary until the user clicks "Save".
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Send, Loader2, Package, Search, Plus, X, Check,
  Download, ExternalLink, FileText, ChevronLeft, Save, Zap,
  AlertCircle, Bot, BookOpen,
} from 'lucide-react';
import { useToast } from '@/components';
import { restClient } from '@/services/api/restClient';
import {
  getEquippedSkills, equipSkill, unequipSkill, getInstalledSkills,
  saveWorkshopSkills, installMarketplaceSkill, streamWorkshopChat,
  consolidateChatToSkill, resetWorkshopSession,
  type EquippedSkill,
} from '@/services/workshopService';
import { useTranslation } from '@/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MarketplaceSkill {
  owner: string;
  name: string;
  installRef: string;
  url: string;
  description: string | null;
}

interface SkillDetail {
  name: string;
  owner: string;
  installRef: string;
  url: string;
  description: string | null;
  skillMdContent: string | null;
  contentFileName: string | null;
  repoUrl: string;
}

type RightPanelView = 'equipped' | 'installed' | 'marketplace' | 'detail';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _msgId = 0;
function msgId() { return `msg-${++_msgId}-${Date.now()}`; }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EquippedSkillBadge({
  skill, onUnequip, isRemoving,
}: {
  skill: EquippedSkill;
  onUnequip: (id: string) => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg group">
      <Zap className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-green-300 truncate block">{skill.displayName || skill.name}</span>
      </div>
      <button
        onClick={() => onUnequip(skill.id)}
        disabled={isRemoving}
        className="p-1 rounded text-green-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        title="Unequip"
      >
        {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      </button>
    </div>
  );
}

function InstalledSkillRow({
  skill, isEquipped, onEquip, isEquipping,
}: {
  skill: EquippedSkill;
  isEquipped: boolean;
  onEquip: (id: string) => void;
  isEquipping: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
      <Package className="w-4 h-4 text-gray-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white block truncate">{skill.displayName || skill.name}</span>
        {skill.description && (
          <span className="text-xs text-gray-500 block truncate">{skill.description}</span>
        )}
      </div>
      {isEquipped ? (
        <span className="text-xs text-green-400 flex items-center gap-1">
          <Check className="w-3 h-3" /> Equipped
        </span>
      ) : (
        <button
          onClick={() => onEquip(skill.id)}
          disabled={isEquipping}
          className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-md transition-colors flex items-center gap-1"
        >
          {isEquipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Equip
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SkillWorkshop() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success: showSuccess, error: showError } = useToast();
  const { t } = useTranslation();

  // Pre-equip skill ID from URL query param (e.g. ?skillId=xxx)
  const preEquipSkillId = searchParams.get('skillId');
  // Return path from URL query param (e.g. ?returnTo=/agents?scope=xxx)
  const returnTo = searchParams.get('returnTo');
  // Single-skill test mode: when skillId is provided, only equip that one skill
  const isSingleSkillMode = !!preEquipSkillId;

  // Agent info
  const [agentName, setAgentName] = useState('Agent');
  const [agentRole, setAgentRole] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatSessionIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Right panel state
  const [rightView, setRightView] = useState<RightPanelView>('equipped');
  const [equippedSkills, setEquippedSkills] = useState<EquippedSkill[]>([]);
  const [installedSkills, setInstalledSkills] = useState<EquippedSkill[]>([]);
  const [isLoadingEquipped, setIsLoadingEquipped] = useState(true);
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(false);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Marketplace state
  const [marketQuery, setMarketQuery] = useState('');
  const [marketResults, setMarketResults] = useState<MarketplaceSkill[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SkillDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [installingRef, setInstallingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Consolidation state
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidatedSkills, setConsolidatedSkills] = useState<Array<{
    id: string; name: string; displayName: string; description: string | null;
  }>>([]);

  // -------------------------------------------------------------------------
  // Load agent info and equipped skills on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!agentId) return;

    // Load agent info
    restClient.get<{ data: { name: string; display_name: string; role: string } }>(
      `/api/agents/${agentId}`,
    ).then(res => {
      setAgentName(res.data.display_name || res.data.name);
      setAgentRole(res.data.role || '');
    }).catch(() => {});

    // In single-skill mode, don't load existing equipped skills — we only want the target skill
    if (isSingleSkillMode) {
      setIsLoadingEquipped(false);
      return;
    }

    // Load equipped skills
    setIsLoadingEquipped(true);
    getEquippedSkills(agentId)
      .then(setEquippedSkills)
      .catch(err => setError(err.message))
      .finally(() => setIsLoadingEquipped(false));
  }, [agentId, isSingleSkillMode]);

  // Auto-equip a skill from URL query param (?skillId=xxx)
  const preEquipDoneRef = useRef(false);
  useEffect(() => {
    if (!agentId || !preEquipSkillId || preEquipDoneRef.current) return;
    preEquipDoneRef.current = true;

    async function setupSingleSkill() {
      try {
        if (isSingleSkillMode) {
          // Reset the backend workshop session to empty, then equip only the target skill
          await resetWorkshopSession(agentId!);
        }
        const skill = await equipSkill(agentId!, preEquipSkillId!);
        if (isSingleSkillMode) {
          setEquippedSkills([skill]);
        } else {
          setEquippedSkills(prev => {
            if (prev.some(s => s.id === skill.id)) return prev;
            return [...prev, skill];
          });
        }
      } catch {
        // Skill may not be found — ignore
      }
    }
    setupSingleSkill();
  }, [agentId, preEquipSkillId, isSingleSkillMode]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const equippedIds = new Set(equippedSkills.map(s => s.id));

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!input.trim() || !agentId || isSending) return;

    const userMsg: ChatMessage = {
      id: msgId(), role: 'user', content: input.trim(), timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsSending(true);
    
    // Keep focus on input
    setTimeout(() => inputRef.current?.focus(), 0);

    const assistantMsg: ChatMessage = {
      id: msgId(), role: 'assistant', content: '', timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      console.log('[SkillWorkshop] Sending message, sessionId:', chatSessionIdRef.current);
      const skillTestPrompt = isSingleSkillMode
        ? `You are a skill testing assistant. Your only job is to test the equipped skill by following its instructions precisely. Do not assume any other role or identity. Focus on demonstrating the skill's capabilities.`
        : undefined;
      const { reader: readerPromise } = streamWorkshopChat(agentId, userMsg.content, chatSessionIdRef.current || undefined, skillTestPrompt);
      const reader = await readerPromise;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            // Capture session ID
            if (event.session_id && !chatSessionIdRef.current) {
              console.log('[SkillWorkshop] Captured session ID:', event.session_id);
              chatSessionIdRef.current = event.session_id;
            }

            // Accumulate text content
            if (event.type === 'assistant' && event.content) {
              const textParts = event.content
                .filter((b: { type: string }) => b.type === 'text')
                .map((b: { text: string }) => b.text || '');
              if (textParts.length > 0) {
                const newText = textParts.join('');
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + newText }
                    : m,
                ));
              }
            }

            if (event.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content || `Error: ${event.message || 'Unknown error'}` }
                  : m,
              ));
            }
          } catch { /* skip unparseable */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${(err as Error).message}` }
            : m,
        ));
      }
    } finally {
      setIsSending(false);
      // Refocus input after response completes
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, agentId, isSending]);

  // -------------------------------------------------------------------------
  // Skill equip/unequip
  // -------------------------------------------------------------------------
  const handleEquip = useCallback(async (skillId: string) => {
    if (!agentId) return;
    setEquippingId(skillId);
    try {
      const skill = await equipSkill(agentId, skillId);
      setEquippedSkills(prev => [...prev.filter(s => s.id !== skill.id), skill]);
    } catch (err) {
      showError('Equip Failed', (err as Error).message);
    } finally {
      setEquippingId(null);
    }
  }, [agentId, showError]);

  const handleUnequip = useCallback(async (skillId: string) => {
    if (!agentId) return;
    setRemovingId(skillId);
    try {
      await unequipSkill(agentId, skillId);
      setEquippedSkills(prev => prev.filter(s => s.id !== skillId));
    } catch (err) {
      showError('Unequip Failed', (err as Error).message);
    } finally {
      setRemovingId(null);
    }
  }, [agentId, showError]);

  // -------------------------------------------------------------------------
  // Load installed skills
  // -------------------------------------------------------------------------
  const handleShowInstalled = useCallback(async () => {
    if (!agentId) return;
    setRightView('installed');
    setIsLoadingInstalled(true);
    try {
      const skills = await getInstalledSkills(agentId);
      setInstalledSkills(skills);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoadingInstalled(false);
    }
  }, [agentId]);

  // -------------------------------------------------------------------------
  // Marketplace search
  // -------------------------------------------------------------------------
  const handleMarketSearch = useCallback(async () => {
    if (!marketQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    setMarketResults([]);
    try {
      const res = await restClient.get<{ data: MarketplaceSkill[] }>(
        `/api/skills/marketplace/search?q=${encodeURIComponent(marketQuery.trim())}`,
      );
      setMarketResults(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSearching(false);
    }
  }, [marketQuery]);

  const handleViewDetail = useCallback(async (skill: MarketplaceSkill) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const res = await restClient.get<{ data: SkillDetail }>(
        `/api/skills/marketplace/detail?ref=${encodeURIComponent(skill.installRef)}`,
      );
      setSelectedDetail(res.data);
      setRightView('detail');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  // Install from marketplace then equip
  const handleInstallAndEquip = useCallback(async (installRef: string) => {
    if (!agentId) return;
    setInstallingRef(installRef);
    try {
      const result = await installMarketplaceSkill(installRef);
      // Now equip it
      const skill = await equipSkill(agentId, result.skillId);
      setEquippedSkills(prev => [...prev.filter(s => s.id !== skill.id), skill]);
      showSuccess('Skill Installed & Equipped', `"${result.displayName}" is ready to test`);
    } catch (err) {
      showError('Install Failed', (err as Error).message);
    } finally {
      setInstallingRef(null);
    }
  }, [agentId, showSuccess, showError]);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!agentId) return;
    setIsSaving(true);
    try {
      const result = await saveWorkshopSkills(agentId);
      showSuccess('Skills Saved', `${result.savedCount} skill(s) saved to agent`);
    } catch (err) {
      showError('Save Failed', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [agentId, showSuccess, showError]);

  // -------------------------------------------------------------------------
  // Consolidate chat into skill
  // -------------------------------------------------------------------------
  const handleConsolidate = useCallback(async () => {
    if (!agentId || messages.length === 0) return;
    setIsConsolidating(true);
    try {
      const result = await consolidateChatToSkill(agentId);
      if (result.needsSkillCreator) {
        // No skill-creator output found — trigger skill-creator via chat
        setInput('Based on our conversation so far, please use the skill-creator to create a reusable skill that captures the key procedures we discussed.');
        showSuccess('Skill Creator', 'No new skills found in workspace. Sending a message to invoke skill-creator — click Send, then Consolidate again after it finishes.');
      } else {
        setConsolidatedSkills(result.created);
        const names = result.created.map(s => s.displayName).join(', ');
        showSuccess('Skills Found', `${result.created.length} skill(s) ready to equip: ${names}`);
      }
    } catch (err) {
      showError('Consolidation Failed', (err as Error).message);
    } finally {
      setIsConsolidating(false);
    }
  }, [agentId, messages, showSuccess, showError]);

  const handleEquipConsolidated = useCallback(async (skillId: string) => {
    if (!agentId) return;
    setEquippingId(skillId);
    try {
      const skill = await equipSkill(agentId, skillId);
      setEquippedSkills(prev => [...prev.filter(s => s.id !== skill.id), skill]);
      setConsolidatedSkills(prev => prev.filter(s => s.id !== skillId));
      showSuccess('Skill Equipped', `"${skill.displayName}" equipped to agent`);
    } catch (err) {
      showError('Equip Failed', (err as Error).message);
    } finally {
      setEquippingId(null);
    }
  }, [agentId, showSuccess, showError]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(returnTo || `/agents/config/${agentId}`)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Zap className="w-5 h-5 text-yellow-400" />
          <div>
            <h1 className="text-base font-semibold">{t('workshop.title')}</h1>
            <p className="text-xs text-gray-500">{agentName}{agentRole ? ` — ${agentRole}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('workshop.skillsEquipped').replace('{n}', String(equippedSkills.length))}</span>
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('workshop.saveSkills')}
          </button>
        </div>
      </header>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Chat */}
        <div className="flex-1 flex flex-col border-r border-gray-800 min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Bot className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">{t('workshop.chatEmpty')}</p>
                <p className="text-xs mt-1 text-gray-600">{t('workshop.chatEmptyHint')}</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 border border-gray-700'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content || (isSending ? '...' : '')}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3">
            {/* Consolidated skills cards */}
            {consolidatedSkills.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {consolidatedSkills.map(skill => (
                  <div key={skill.id} className="p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-green-300 truncate block">{skill.displayName}</span>
                        {skill.description && (
                          <span className="text-xs text-gray-400 block truncate">{skill.description}</span>
                        )}
                      </div>
                      <button onClick={() => handleEquipConsolidated(skill.id)} disabled={equippingId === skill.id}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-md transition-colors flex items-center gap-1 flex-shrink-0">
                        {equippingId === skill.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        {t('workshop.equip')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {messages.length >= 2 && (
                <button onClick={handleConsolidate} disabled={isConsolidating || isSending}
                  title="Consolidate chat into a skill"
                  className="px-3 py-2.5 bg-yellow-600/20 hover:bg-yellow-600/30 disabled:bg-gray-800 disabled:text-gray-600 text-yellow-400 rounded-lg transition-colors flex items-center gap-1.5 text-xs flex-shrink-0">
                  {isConsolidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                  {t('workshop.consolidate')}
                </button>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Use skill-creator to create a skill. I need this skill to..."
                disabled={isSending}
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
              <button onClick={handleSend} disabled={isSending || !input.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Skill Panel */}
        <div className="w-96 flex flex-col overflow-hidden flex-shrink-0">
          {/* Panel tabs */}
          <div className="border-b border-gray-800 px-3 py-2 flex items-center gap-1">
            {rightView === 'detail' ? (
              <button onClick={() => setRightView('marketplace')}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" /> {t('workshop.back')}
              </button>
            ) : (
              <>
                <button onClick={() => setRightView('equipped')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${rightView === 'equipped' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {t('workshop.equipped')} ({equippedSkills.length})
                </button>
                <button onClick={handleShowInstalled}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${rightView === 'installed' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {t('skills.tabInstalled')}
                </button>
                <button onClick={() => setRightView('marketplace')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${rightView === 'marketplace' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Marketplace
                </button>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mt-2 px-3 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Equipped view */}
            {rightView === 'equipped' && (
              isLoadingEquipped ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
              ) : equippedSkills.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('workshop.noEquipped')}</p>
                  <p className="text-xs mt-1">{t('workshop.noEquippedHint')}</p>
                </div>
              ) : (
                equippedSkills.map(skill => (
                  <EquippedSkillBadge
                    key={skill.id}
                    skill={skill}
                    onUnequip={handleUnequip}
                    isRemoving={removingId === skill.id}
                  />
                ))
              )
            )}

            {/* Installed view */}
            {rightView === 'installed' && (
              isLoadingInstalled ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
              ) : installedSkills.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('workshop.noInstalled')}</p>
                  <p className="text-xs mt-1">{t('workshop.noInstalledHint')}</p>
                </div>
              ) : (
                installedSkills.map(skill => (
                  <InstalledSkillRow
                    key={skill.id}
                    skill={skill}
                    isEquipped={equippedIds.has(skill.id)}
                    onEquip={handleEquip}
                    isEquipping={equippingId === skill.id}
                  />
                ))
              )
            )}

            {/* Marketplace view */}
            {rightView === 'marketplace' && (
              <>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                      value={marketQuery}
                      onChange={e => setMarketQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleMarketSearch()}
                      placeholder={t('workshop.searchSkills')}
                      className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <button onClick={handleMarketSearch} disabled={isSearching || !marketQuery.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs rounded-lg transition-colors">
                    {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="ml-2 text-xs text-gray-400">{t('workshop.searching')}</span>
                  </div>
                ) : marketResults.length > 0 ? (
                  marketResults.map(skill => (
                    <div key={skill.installRef}
                      className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white font-medium block truncate">{skill.name}</span>
                          <span className="text-xs text-gray-500 font-mono">{skill.owner}</span>
                          {skill.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{skill.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => handleViewDetail(skill)} disabled={isLoadingDetail}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {t('workshop.details')}
                        </button>
                        <button onClick={() => handleInstallAndEquip(skill.installRef)}
                          disabled={installingRef === skill.installRef}
                          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded transition-colors flex items-center gap-1">
                          {installingRef === skill.installRef
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />}
                          {t('workshop.installEquip')}
                        </button>
                      </div>
                    </div>
                  ))
                ) : marketQuery && !isSearching ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">{t('workshop.noResults').replace('{q}', marketQuery)}</p>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">{t('skills.searchPrompt')}</p>
                  </div>
                )}
              </>
            )}

            {/* Detail view */}
            {rightView === 'detail' && selectedDetail && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedDetail.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">{selectedDetail.owner}</p>
                </div>
                <div className="flex gap-1.5">
                  <a href={selectedDetail.repoUrl} target="_blank" rel="noopener noreferrer"
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> GitHub
                  </a>
                  <button onClick={() => handleInstallAndEquip(selectedDetail.installRef)}
                    disabled={!!installingRef}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded transition-colors flex items-center gap-1">
                    {installingRef ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {t('workshop.installEquip')}
                  </button>
                </div>
                {selectedDetail.skillMdContent ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-gray-800 bg-gray-800/50">
                      <span className="text-xs text-gray-400 font-mono">{selectedDetail.contentFileName || 'SKILL.md'}</span>
                    </div>
                    <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[50vh]">
                      {selectedDetail.skillMdContent}
                    </pre>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg text-center text-gray-500">
                    <FileText className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">{t('workshop.noDocs')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SkillWorkshop;
