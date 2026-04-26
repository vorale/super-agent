/**
 * IMChannelsPanel
 *
 * Admin panel for managing IM channel bindings on a business scope.
 * Allows connecting Slack, Discord, and generic webhook channels
 * so external users can chat with the scope's agents via IM.
 */

import { useState } from 'react'
import { Plus, Trash2, Loader2, ToggleLeft, ToggleRight, MessageSquare, Hash, Copy, CheckCircle2, Pencil, X, Save } from 'lucide-react'
import { useIMChannels } from '@/services/useIMChannels'
import type { CreateIMChannelRequest, UpdateIMChannelRequest } from '@/services/useIMChannels'
import { useTranslation } from '@/i18n'

const CHANNEL_TYPES = [
  { value: 'slack', label: 'Slack', icon: '💬', description: 'Connect a Slack channel via Events API' },
  { value: 'discord', label: 'Discord', icon: '🎮', description: 'Connect via Discord Gateway (WebSocket)' },
  { value: 'telegram', label: 'Telegram', icon: '✈️', description: 'Connect a Telegram group via Bot API' },
  { value: 'feishu', label: 'Feishu', icon: '🪶', description: 'Connect via Feishu WSClient (WebSocket)' },
  { value: 'dingtalk', label: 'DingTalk', icon: '🔔', description: 'Connect via DingTalk Stream or Webhook' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '📱', description: 'Connect via Meta Cloud API' },
  { value: 'wecom', label: 'WeCom', icon: '💼', description: '企业微信 Bot (WebSocket) or Agent (HTTP)' },
  { value: 'webhook', label: 'Generic Webhook', icon: '🔗', description: 'Any platform via HTTP webhook' },
] as const

interface IMChannelsPanelProps {
  scopeId: string
  scopeName?: string
}

export function IMChannelsPanel({ scopeId, scopeName }: IMChannelsPanelProps) {
  const { bindings, isLoading, error, create, update, remove, clearError } = useIMChannels(scopeId)
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<CreateIMChannelRequest>({
    channel_type: 'slack',
    channel_id: '',
    channel_name: '',
    bot_token: '',
    webhook_url: '',
    config: {},
  })
  const [isSaving, setIsSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dingtalkMode, setDingtalkMode] = useState<'stream' | 'webhook'>('webhook')
  const [wecomMode, setWecomMode] = useState<'bot' | 'agent' | 'both'>('bot')

  // ── Edit state ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<UpdateIMChannelRequest>({})
  const [isUpdating, setIsUpdating] = useState(false)

  const startEditing = (binding: import('@/services/useIMChannels').IMChannelBinding) => {
    setEditingId(binding.id)
    setEditData({
      channel_name: binding.channel_name || '',
      webhook_url: binding.webhook_url || '',
      config: { ...(binding.config || {}) },
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleSaveEdit = async (bindingId: string) => {
    setIsUpdating(true)
    const result = await update(bindingId, editData)
    setIsUpdating(false)
    if (result) {
      setEditingId(null)
      setEditData({})
    }
  }

  const handleCreate = async () => {
    // Auto-fill channel_id for DingTalk webhook mode
    const effectiveData = { ...formData };
    if (effectiveData.channel_type === 'dingtalk' && dingtalkMode === 'webhook') {
      effectiveData.channel_id = '*';
    }
    // Auto-fill channel_id for WeCom from bot_id or corp_id
    if (effectiveData.channel_type === 'wecom' && !effectiveData.channel_id) {
      const cfg = effectiveData.config as Record<string, string>;
      effectiveData.channel_id = cfg?.bot_id || cfg?.corp_id || 'wecom';
    }
    if (!effectiveData.channel_id) return;
    setIsSaving(true);
    const result = await create(effectiveData);
    setIsSaving(false);
    if (result) {
      setShowForm(false);
      setFormData({ channel_type: 'slack', channel_id: '', channel_name: '', bot_token: '', webhook_url: '', config: {} });
    }
  };

  const handleToggle = async (bindingId: string, currentEnabled: boolean) => {
    await update(bindingId, { is_enabled: !currentEnabled })
  }

  const handleDelete = async (bindingId: string) => {
    if (!confirm(t('im.confirmRemove'))) return
    await remove(bindingId)
  }

  const copyWebhookUrl = (bindingId: string) => {
    const url = `${window.location.origin.replace(/:\d+$/, ':3000')}/api/im/webhook/${bindingId}`
    navigator.clipboard.writeText(url)
    setCopiedId(bindingId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const channelTypeInfo = (type: string) => CHANNEL_TYPES.find(t => t.value === type)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('im.title')}</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <Plus className="w-3 h-3" />
          {t('im.addChannel')}
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        {t('im.connectDesc').replace('{name}', scopeName || 'this scope')}
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-red-400 text-sm">{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-300 text-xs">{t('im.dismiss')}</button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {CHANNEL_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => setFormData(prev => ({ ...prev, channel_type: ct.value }))}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  formData.channel_type === ct.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <span className="text-lg">{ct.icon}</span>
                <div className="text-sm font-medium text-white mt-1">{ct.label}</div>
                <div className="text-xs text-gray-400">{ct.description}</div>
              </button>
            ))}
          </div>

          {/* Channel ID + Display Name — hidden for DingTalk webhook mode and WeCom (have their own forms) */}
          {!(formData.channel_type === 'dingtalk' && dingtalkMode === 'webhook') && formData.channel_type !== 'wecom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {formData.channel_type === 'slack' ? 'Slack Channel ID' :
                   formData.channel_type === 'discord' ? 'Discord Channel ID' :
                   formData.channel_type === 'telegram' ? 'Telegram Chat ID' :
                   formData.channel_type === 'feishu' ? 'Feishu Chat ID' :
                   formData.channel_type === 'dingtalk' ? 'DingTalk Conversation ID' :
                   formData.channel_type === 'whatsapp' ? 'Phone Number ID' :
                   formData.channel_type === 'wecom' ? 'Bot ID / Corp ID' : 'Channel Identifier'}
                </label>
                <input
                  type="text"
                  value={formData.channel_id}
                  onChange={e => setFormData(prev => ({ ...prev, channel_id: e.target.value }))}
                  placeholder={formData.channel_type === 'slack' ? 'C0123456789' :
                               formData.channel_type === 'telegram' ? '-1001234567890' : 'channel-id'}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('im.displayName')}</label>
              <input
                type="text"
                value={formData.channel_name || ''}
                onChange={e => setFormData(prev => ({ ...prev, channel_name: e.target.value }))}
                placeholder="#general"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          )}

          {formData.channel_type !== 'webhook' && !(formData.channel_type === 'dingtalk' && dingtalkMode === 'webhook') && formData.channel_type !== 'wecom' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {formData.channel_type === 'feishu' ? 'App Secret' :
                 formData.channel_type === 'dingtalk' ? 'Client Secret (App Secret)' :
                 formData.channel_type === 'whatsapp' ? 'Access Token' : 'Bot Token'}
              </label>
              <input
                type="password"
                value={formData.bot_token || ''}
                onChange={e => setFormData(prev => ({ ...prev, bot_token: e.target.value }))}
                placeholder={formData.channel_type === 'slack' ? 'xoxb-...' :
                             formData.channel_type === 'telegram' ? '123456:ABC-DEF...' :
                             formData.channel_type === 'feishu' ? 'App Secret from Feishu console' :
                             formData.channel_type === 'dingtalk' ? 'App Secret from DingTalk console' :
                             formData.channel_type === 'whatsapp' ? 'Meta permanent access token' : 'Bot token'}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* Platform-specific config fields */}
          {formData.channel_type === 'feishu' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">App ID</label>
                <input
                  type="text"
                  value={(formData.config as Record<string, string>)?.app_id || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, app_id: e.target.value },
                  }))}
                  placeholder="cli_a1234567890b"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Verification Token (optional)</label>
                <input
                  type="password"
                  value={(formData.config as Record<string, string>)?.verification_token || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, verification_token: e.target.value },
                  }))}
                  placeholder="Event verification token"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {formData.channel_type === 'slack' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Signing Secret (optional, for request verification)</label>
              <input
                type="password"
                value={(formData.config as Record<string, string>)?.signing_secret || ''}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, signing_secret: e.target.value },
                }))}
                placeholder="Slack app signing secret"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {formData.channel_type === 'discord' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Public Key (for interaction verification)</label>
              <input
                type="text"
                value={(formData.config as Record<string, string>)?.public_key || ''}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, public_key: e.target.value },
                }))}
                placeholder="Discord application public key"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {formData.channel_type === 'telegram' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Webhook Secret Token (optional)</label>
              <input
                type="password"
                value={(formData.config as Record<string, string>)?.secret_token || ''}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, secret_token: e.target.value },
                }))}
                placeholder="Secret token for webhook verification"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {formData.channel_type === 'dingtalk' && (
            <div className="space-y-3">
              {/* Mode selector */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t('im.connectionMode')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setDingtalkMode('webhook')
                      setFormData(prev => ({ ...prev, channel_id: '*', bot_token: '', config: { ...prev.config, client_id: '' } }))
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                      dingtalkMode === 'webhook' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {t('im.outgoingWebhook')}
                    <div className="text-[10px] text-gray-500 mt-0.5">{t('im.simpleHttp')}</div>
                  </button>
                  <button
                    onClick={() => {
                      setDingtalkMode('stream')
                      setFormData(prev => ({ ...prev, channel_id: '', webhook_url: '', config: { ...prev.config } }))
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                      dingtalkMode === 'stream' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {t('im.streamWs')}
                    <div className="text-[10px] text-gray-500 mt-0.5">{t('im.fullFeatured')}</div>
                  </button>
                </div>
              </div>

              {dingtalkMode === 'webhook' ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Robot Webhook URL</label>
                    <input
                      type="text"
                      value={formData.webhook_url || ''}
                      onChange={e => setFormData(prev => ({ ...prev, webhook_url: e.target.value }))}
                      placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">From DingTalk group → Settings → Smart Group Assistant → Add Robot → Custom</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Signing Secret (optional)</label>
                    <input
                      type="password"
                      value={(formData.config as Record<string, string>)?.signing_secret || ''}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, signing_secret: e.target.value },
                      }))}
                      placeholder="SEC..."
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">If you enabled "Sign" in the robot security settings</p>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-xs text-blue-400 font-medium mb-1">Callback URL (set this in DingTalk robot settings):</p>
                    <code className="text-xs text-blue-300 bg-gray-900 px-2 py-1 rounded block">
                      {window.location.origin.replace(/:\d+$/, ':3001')}/api/im/dingtalk/callback
                    </code>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Client ID (App Key)</label>
                    <input
                      type="text"
                      value={(formData.config as Record<string, string>)?.client_id || ''}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, client_id: e.target.value },
                      }))}
                      placeholder="dingxxxxxxxx"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Signing Secret (optional)</label>
                    <input
                      type="password"
                      value={(formData.config as Record<string, string>)?.signing_secret || ''}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, signing_secret: e.target.value },
                      }))}
                      placeholder="For legacy webhook verification"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {formData.channel_type === 'whatsapp' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Phone Number ID</label>
                <input
                  type="text"
                  value={(formData.config as Record<string, string>)?.phone_number_id || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    channel_id: e.target.value,
                    config: { ...prev.config, phone_number_id: e.target.value },
                  }))}
                  placeholder="1234567890"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Verify Token (for webhook setup)</label>
                <input
                  type="text"
                  value={(formData.config as Record<string, string>)?.verify_token || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, verify_token: e.target.value },
                  }))}
                  placeholder="my-verify-token-123"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">App Secret (for signature verification)</label>
                <input
                  type="password"
                  value={(formData.config as Record<string, string>)?.app_secret || ''}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, app_secret: e.target.value },
                  }))}
                  placeholder="Meta App Secret"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* WeCom (企业微信) config */}
          {formData.channel_type === 'wecom' && (
            <div className="space-y-3">
              {/* Mode selector */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">连接模式 (Connection Mode)</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setWecomMode('bot')
                      setFormData(prev => ({ ...prev, channel_id: '', bot_token: '', config: { bot_id: '', secret: '' } }))
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                      wecomMode === 'bot' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Bot 模式
                    <div className="text-[10px] text-gray-500 mt-0.5">WebSocket 长连接</div>
                  </button>
                  <button
                    onClick={() => {
                      setWecomMode('agent')
                      setFormData(prev => ({ ...prev, channel_id: '', bot_token: '', config: { corp_id: '', corp_secret: '', agent_id: '', token: '', encoding_aes_key: '' } }))
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                      wecomMode === 'agent' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    Agent 模式
                    <div className="text-[10px] text-gray-500 mt-0.5">自建应用 HTTP 回调</div>
                  </button>
                  <button
                    onClick={() => {
                      setWecomMode('both')
                      setFormData(prev => ({ ...prev, channel_id: '', bot_token: '', config: { bot_id: '', secret: '', corp_id: '', corp_secret: '', agent_id: '', token: '', encoding_aes_key: '' } }))
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm text-center transition-colors ${
                      wecomMode === 'both' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    双模式
                    <div className="text-[10px] text-gray-500 mt-0.5">Bot + Agent 同时启用</div>
                  </button>
                </div>
              </div>

              {/* Bot mode fields */}
              {(wecomMode === 'bot' || wecomMode === 'both') && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 font-medium">🤖 Bot 模式配置</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Bot ID</label>
                      <input
                        type="text"
                        value={(formData.config as Record<string, string>)?.bot_id || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          channel_id: e.target.value,
                          config: { ...prev.config, bot_id: e.target.value },
                        }))}
                        placeholder="从企业微信管理后台获取"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Secret</label>
                      <input
                        type="password"
                        value={(formData.config as Record<string, string>)?.secret || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          bot_token: e.target.value,
                          config: { ...prev.config, secret: e.target.value },
                        }))}
                        placeholder="Bot Secret"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Agent mode fields */}
              {(wecomMode === 'agent' || wecomMode === 'both') && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 font-medium">🏢 Agent 模式配置 (自建应用)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Corp ID (企业 ID)</label>
                      <input
                        type="text"
                        value={(formData.config as Record<string, string>)?.corp_id || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          channel_id: prev.channel_id || e.target.value,
                          config: { ...prev.config, corp_id: e.target.value },
                        }))}
                        placeholder="ww1234567890abcdef"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Corp Secret (应用密钥)</label>
                      <input
                        type="password"
                        value={(formData.config as Record<string, string>)?.corp_secret || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, corp_secret: e.target.value },
                        }))}
                        placeholder="应用的 Secret"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Agent ID (应用 ID)</label>
                      <input
                        type="text"
                        value={(formData.config as Record<string, string>)?.agent_id || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, agent_id: e.target.value },
                        }))}
                        placeholder="1000002"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Token (回调验证)</label>
                      <input
                        type="password"
                        value={(formData.config as Record<string, string>)?.token || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, token: e.target.value },
                        }))}
                        placeholder="回调 Token"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">EncodingAESKey (消息加密密钥, 43 位)</label>
                      <input
                        type="password"
                        value={(formData.config as Record<string, string>)?.encoding_aes_key || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, encoding_aes_key: e.target.value },
                        }))}
                        placeholder="43 位 Base64 编码密钥"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                    <p className="text-xs text-blue-400 font-medium mb-1">回调 URL (在企业微信管理后台「API 接收」中配置):</p>
                    <code className="text-xs text-blue-300 bg-gray-900 px-2 py-1 rounded block">
                      {window.location.origin.replace(/:\d+$/, ':3001')}/api/im/wecom/callback
                    </code>
                    <p className="text-[10px] text-gray-500 mt-1">⚠️ 请先在此处完成配置并保存，再到企业微信后台保存回调 URL（企业微信会立即发送验证请求）</p>
                  </div>
                </div>
              )}

              {/* Display name */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">显示名称 (Display Name)</label>
                <input
                  type="text"
                  value={formData.channel_name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, channel_name: e.target.value }))}
                  placeholder="企业微信"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={
                isSaving ||
                (formData.channel_type === 'dingtalk' && dingtalkMode === 'webhook'
                  ? !formData.webhook_url
                  : formData.channel_type === 'wecom'
                    ? !(
                        (wecomMode === 'bot' && (formData.config as Record<string, string>)?.bot_id && (formData.config as Record<string, string>)?.secret) ||
                        (wecomMode === 'agent' && (formData.config as Record<string, string>)?.corp_id && (formData.config as Record<string, string>)?.corp_secret) ||
                        (wecomMode === 'both' && (formData.config as Record<string, string>)?.bot_id && (formData.config as Record<string, string>)?.secret)
                      )
                    : !formData.channel_id)
              }
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('im.connectChannel')}
            </button>
          </div>
        </div>
      )}

      {/* Bindings List */}
      {bindings.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t('im.noChannels')}</p>
          <p className="text-xs mt-1">{t('im.noChannelsHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bindings.map(binding => {
            const info = channelTypeInfo(binding.channel_type)
            const isEditing = editingId === binding.id
            const cfg = (binding.config || {}) as Record<string, string>
            return (
              <div
                key={binding.id}
                className={`rounded-lg border transition-colors ${
                  binding.is_enabled
                    ? 'bg-gray-800/30 border-gray-700'
                    : 'bg-gray-900/50 border-gray-800 opacity-60'
                }`}
              >
                {/* Summary row */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{info?.icon || '📡'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {binding.channel_name || binding.channel_id}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                          {info?.label || binding.channel_type}
                        </span>
                        {!binding.is_enabled && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                            {t('im.disabled')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Hash className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-500 font-mono">{binding.channel_id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Webhook URL copy button */}
                    {binding.channel_type === 'webhook' && (
                      <button
                        onClick={() => copyWebhookUrl(binding.id)}
                        className="p-1.5 text-gray-400 hover:text-white transition-colors"
                        title="Copy webhook URL"
                      >
                        {copiedId === binding.id ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => isEditing ? cancelEditing() : startEditing(binding)}
                      className={`p-1.5 transition-colors ${isEditing ? 'text-blue-400 hover:text-blue-300' : 'text-gray-400 hover:text-white'}`}
                      title={isEditing ? 'Cancel edit' : 'Edit'}
                    >
                      {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </button>

                    {/* Toggle enabled/disabled */}
                    <button
                      onClick={() => handleToggle(binding.id, binding.is_enabled)}
                      className="p-1.5 text-gray-400 hover:text-white transition-colors"
                      title={binding.is_enabled ? 'Disable' : 'Enable'}
                    >
                      {binding.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(binding.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <div className="border-t border-gray-700 p-4 space-y-3">
                    {/* Display name — all types */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">{t('im.displayName')}</label>
                      <input
                        type="text"
                        value={editData.channel_name ?? ''}
                        onChange={e => setEditData(prev => ({ ...prev, channel_name: e.target.value }))}
                        placeholder={info?.label || 'Channel name'}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    {/* Bot token — Slack, Discord, Telegram, Feishu */}
                    {['slack', 'discord', 'telegram', 'feishu'].includes(binding.channel_type) && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          {binding.channel_type === 'feishu' ? 'App Secret' : 'Bot Token'}
                          <span className="text-gray-600 ml-1">(leave blank to keep current)</span>
                        </label>
                        <input
                          type="password"
                          value={editData.bot_token ?? ''}
                          onChange={e => setEditData(prev => ({ ...prev, bot_token: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    )}

                    {/* Webhook URL — DingTalk webhook, generic webhook */}
                    {(binding.channel_type === 'webhook' || (binding.channel_type === 'dingtalk' && binding.webhook_url)) && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Webhook URL</label>
                        <input
                          type="text"
                          value={editData.webhook_url ?? ''}
                          onChange={e => setEditData(prev => ({ ...prev, webhook_url: e.target.value }))}
                          placeholder="https://..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    )}

                    {/* Platform-specific config fields */}
                    {binding.channel_type === 'slack' && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Signing Secret</label>
                        <input
                          type="password"
                          value={(editData.config as Record<string, string>)?.signing_secret ?? cfg.signing_secret ?? ''}
                          onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, signing_secret: e.target.value } }))}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    )}

                    {binding.channel_type === 'feishu' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">App ID</label>
                          <input
                            type="text"
                            value={(editData.config as Record<string, string>)?.app_id ?? cfg.app_id ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, app_id: e.target.value } }))}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Verification Token</label>
                          <input
                            type="password"
                            value={(editData.config as Record<string, string>)?.verification_token ?? cfg.verification_token ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, verification_token: e.target.value } }))}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {binding.channel_type === 'dingtalk' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Client ID (App Key)</label>
                          <input
                            type="text"
                            value={(editData.config as Record<string, string>)?.client_id ?? cfg.client_id ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, client_id: e.target.value } }))}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Client Secret
                            <span className="text-gray-600 ml-1">(leave blank to keep)</span>
                          </label>
                          <input
                            type="password"
                            value={editData.bot_token ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, bot_token: e.target.value }))}
                            placeholder="••••••••"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {binding.channel_type === 'whatsapp' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Verify Token</label>
                          <input
                            type="text"
                            value={(editData.config as Record<string, string>)?.verify_token ?? cfg.verify_token ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, verify_token: e.target.value } }))}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">App Secret</label>
                          <input
                            type="password"
                            value={(editData.config as Record<string, string>)?.app_secret ?? cfg.app_secret ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, app_secret: e.target.value } }))}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-400 mb-1">
                            Access Token <span className="text-gray-600">(leave blank to keep)</span>
                          </label>
                          <input
                            type="password"
                            value={editData.bot_token ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, bot_token: e.target.value }))}
                            placeholder="••••••••"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {binding.channel_type === 'wecom' && (
                      <div className="space-y-3">
                        {/* Bot mode fields */}
                        {(cfg.bot_id || cfg.secret) && (
                          <>
                            <p className="text-xs text-gray-400 font-medium">🤖 Bot 模式</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Bot ID</label>
                                <input
                                  type="text"
                                  value={(editData.config as Record<string, string>)?.bot_id ?? cfg.bot_id ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, bot_id: e.target.value } }))}
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                  Secret <span className="text-gray-600">(leave blank to keep)</span>
                                </label>
                                <input
                                  type="password"
                                  value={(editData.config as Record<string, string>)?.secret ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, secret: e.target.value } }))}
                                  placeholder="••••••••"
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </>
                        )}
                        {/* Agent mode fields */}
                        {(cfg.corp_id || cfg.corp_secret) && (
                          <>
                            <p className="text-xs text-gray-400 font-medium">🏢 Agent 模式</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Corp ID</label>
                                <input
                                  type="text"
                                  value={(editData.config as Record<string, string>)?.corp_id ?? cfg.corp_id ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, corp_id: e.target.value } }))}
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                  Corp Secret <span className="text-gray-600">(blank = keep)</span>
                                </label>
                                <input
                                  type="password"
                                  value={(editData.config as Record<string, string>)?.corp_secret ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, corp_secret: e.target.value } }))}
                                  placeholder="••••••••"
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Agent ID</label>
                                <input
                                  type="text"
                                  value={(editData.config as Record<string, string>)?.agent_id ?? cfg.agent_id ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, agent_id: e.target.value } }))}
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Token</label>
                                <input
                                  type="password"
                                  value={(editData.config as Record<string, string>)?.token ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, token: e.target.value } }))}
                                  placeholder="••••••••"
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs text-gray-400 mb-1">
                                  EncodingAESKey <span className="text-gray-600">(blank = keep)</span>
                                </label>
                                <input
                                  type="password"
                                  value={(editData.config as Record<string, string>)?.encoding_aes_key ?? ''}
                                  onChange={e => setEditData(prev => ({ ...prev, config: { ...prev.config, encoding_aes_key: e.target.value } }))}
                                  placeholder="••••••••"
                                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Save / Cancel buttons */}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => handleSaveEdit(binding.id)}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                      >
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {t('common.save') || 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Setup Instructions */}
      {bindings.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-3 space-y-2">
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">Slack:</strong> Set Event Subscriptions URL to{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">{window.location.origin.replace(/:\d+$/, ':3001')}/api/im/slack/events</code>
            {' '}and subscribe to <code className="text-blue-400 bg-gray-900 px-1 rounded">message.channels</code>.
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">Telegram:</strong> Use the "Register Webhook" button, or call{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">setWebhook</code> with URL{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">{window.location.origin.replace(/:\d+$/, ':3001')}/api/im/telegram/webhook</code>
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">Discord:</strong> Connects automatically via Gateway WebSocket. Just provide the Bot Token.
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">Feishu:</strong> Connects automatically via WSClient. Provide App ID + App Secret.
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">DingTalk:</strong> Webhook mode: paste the robot webhook URL and set callback URL to{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">{window.location.origin.replace(/:\d+$/, ':3001')}/api/im/dingtalk/callback</code>.
            Stream mode: provide Client ID + Client Secret, connects automatically.
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">WhatsApp:</strong> Set webhook URL in Meta Developer Console to{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">{window.location.origin.replace(/:\d+$/, ':3001')}/api/im/whatsapp/webhook</code>
            {' '}and subscribe to <code className="text-blue-400 bg-gray-900 px-1 rounded">messages</code>.
          </p>
          <p className="text-xs text-gray-400">
            <strong className="text-gray-300">WeCom (企业微信):</strong> Bot 模式通过 WebSocket 自动连接，提供 Bot ID + Secret 即可。
            Agent 模式需在企业微信管理后台「API 接收」中配置回调 URL 为{' '}
            <code className="text-blue-400 bg-gray-900 px-1 rounded">{window.location.origin.replace(/:\d+$/, ':3001')}/api/im/wecom/callback</code>。
          </p>
        </div>
      )}
    </div>
  )
}
