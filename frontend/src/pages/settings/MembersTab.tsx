import { useState } from 'react';
import { UserPlus, Trash2, ChevronDown, Loader2, AlertCircle, X, Mail, Clock, KeyRound, Copy, Check, RefreshCw } from 'lucide-react';
import { useMembers } from '@/services/useMembers';
import { useTranslation } from '@/i18n';
import type { MemberRole } from '@/services/api/restMembersService';

const ROLES: MemberRole[] = ['owner', 'admin', 'member', 'viewer'];
const ASSIGNABLE_ROLES: MemberRole[] = ['admin', 'member', 'viewer'];

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-purple-500/20 text-purple-300',
  admin: 'bg-blue-500/20 text-blue-300',
  member: 'bg-green-500/20 text-green-300',
  viewer: 'bg-gray-500/20 text-gray-300',
};

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join('');
}

type AddMode = 'invite' | 'provision' | null;

interface Props {
  isAdmin: boolean;
  currentUserId: string;
}

export function MembersTab({ isAdmin, currentUserId }: Props) {
  const { members, isLoading, error, clearError, invite, updateRole, remove, provision } = useMembers();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AddMode>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('member');
  const [isInviting, setIsInviting] = useState(false);

  // Provision form state
  const [provUsername, setProvUsername] = useState('');
  const [provFullName, setProvFullName] = useState('');
  const [provPassword, setProvPassword] = useState(() => generatePassword());
  const [provRole, setProvRole] = useState<MemberRole>('member');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provResult, setProvResult] = useState<{ username: string; password: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    const ok = await invite(inviteEmail.trim(), inviteRole);
    setIsInviting(false);
    if (ok) {
      setInviteEmail('');
      setInviteRole('member');
      setMode(null);
    }
  };

  const handleProvision = async () => {
    if (!provUsername.trim() || !provPassword.trim()) return;
    setIsProvisioning(true);
    const result = await provision(provUsername.trim(), provPassword, provRole, provFullName.trim() || undefined);
    setIsProvisioning(false);
    if (result) {
      setProvResult({ username: provUsername.trim(), password: provPassword });
      setProvUsername('');
      setProvFullName('');
      setProvPassword(generatePassword());
      setProvRole('member');
      setMode(null);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(t('members.confirmRemove').replace('{name}', name))) return;
    await remove(id);
  };

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Credentials reveal after provision */}
      {provResult && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <p className="text-sm font-medium text-green-400 mb-1">{t('members.userCreated')}</p>
          <p className="text-xs text-gray-400 mb-3">{t('members.credentialsHint')}</p>
          <div className="space-y-2">
            {[{ label: t('members.username'), value: provResult.username, masked: false }, { label: t('members.password'), value: provResult.password, masked: true }].map(({ label, value, masked }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
                <code className="flex-1 px-2 py-1 bg-gray-900 rounded text-xs text-gray-300 font-mono">{masked ? '•'.repeat(value.length) : value}</code>
                <button onClick={() => copyToClipboard(value, label)} className="p-1.5 hover:bg-gray-700 rounded">
                  {copiedField === label ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setProvResult(null)} className="mt-3 text-xs text-green-400 hover:text-green-300">{t('members.dismiss')}</button>
        </div>
      )}

      {/* Add member buttons */}
      {isAdmin && mode === null && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode('provision')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
          >
            <KeyRound className="w-4 h-4" />
            {t('members.createUser')}
          </button>
          <button
            onClick={() => setMode('invite')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            <UserPlus className="w-4 h-4" />
            {t('members.inviteByEmail')}
          </button>
        </div>
      )}

      {/* Provision form */}
      {isAdmin && mode === 'provision' && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-4">
          <h3 className="text-sm font-medium text-white">{t('members.createWithCredentials')}</h3>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('members.usernameEmail')}</label>
            <input
              type="text"
              value={provUsername}
              onChange={(e) => setProvUsername(e.target.value)}
              placeholder="user@company.com"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('members.fullName')}</label>
            <input
              type="text"
              value={provFullName}
              onChange={(e) => setProvFullName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('members.password')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={provPassword}
                onChange={(e) => setProvPassword(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white font-mono focus:border-blue-500 outline-none"
              />
              <button
                onClick={() => setProvPassword(generatePassword())}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => copyToClipboard(provPassword, 'pw')}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
              >
                {copiedField === 'pw' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('members.role')}</label>
            <select
              value={provRole}
              onChange={(e) => setProvRole(e.target.value as MemberRole)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:border-blue-500 outline-none"
            >
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setMode(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">{t('common.cancel')}</button>
            <button
              onClick={handleProvision}
              disabled={isProvisioning || !provUsername.trim() || !provPassword.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              {isProvisioning && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('members.createUser')}
            </button>
          </div>
        </div>
      )}

      {/* Invite form */}
      {isAdmin && mode === 'invite' && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-4">
          <h3 className="text-sm font-medium text-white">{t('members.inviteByEmailTitle')}</h3>
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="colleague@company.com"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as MemberRole)}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:border-blue-500 outline-none"
            >
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setMode(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">{t('common.cancel')}</button>
            <button
              onClick={handleInvite}
              disabled={isInviting || !inviteEmail.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              {isInviting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('members.sendInvite')}
            </button>
          </div>
        </div>
      )}

      {/* Members List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{t('members.colMember')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{t('members.colRole')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{t('members.colStatus')}</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {members.map((member) => {
                const isCurrentUser = member.user_id === currentUserId;
                const isOwner = member.role === 'owner';
                const canModify = isAdmin && !isOwner && !isCurrentUser;

                return (
                  <tr key={member.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(member.name || member.invited_email || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-medium">
                            {member.name || member.invited_email || member.email || 'Unknown'}
                            {isCurrentUser && <span className="ml-2 text-xs text-gray-500">{t('members.you')}</span>}
                          </div>
                          {member.status === 'pending' ? (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Mail className="w-3 h-3" />
                              {member.invited_email || member.email}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">{member.email || ''}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canModify ? (
                        <div className="relative inline-block">
                          <select
                            value={member.role}
                            onChange={(e) => updateRole(member.id, e.target.value as MemberRole)}
                            className="appearance-none pl-2 pr-6 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:border-blue-500 outline-none cursor-pointer"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[member.role] ?? 'bg-gray-500/20 text-gray-300'}`}>
                          {member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.status === 'pending' ? (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <Clock className="w-3 h-3" /> {t('members.pending')}
                        </span>
                      ) : (
                        <span className="text-xs text-green-400">{t('members.active')}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {canModify && (
                          <button
                            onClick={() => handleRemove(member.id, member.name || member.email || member.invited_email || 'this member')}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            title={t('members.removeMember')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {members.length === 0 && !isLoading && (
            <div className="text-center py-10 text-gray-500 text-sm">{t('members.noMembers')}</div>
          )}
        </div>
      )}
    </div>
  );
}
