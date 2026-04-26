/**
 * Workshop Service (Frontend)
 *
 * API calls for the Skill Workshop — equip/unequip skills,
 * get suggestions, list installed skills, save, and chat.
 */

import { restClient, getAuthToken } from './api/restClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquippedSkill {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
}

export interface MarketplaceSuggestion {
  owner: string;
  name: string;
  installRef: string;
  url: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getEquippedSkills(agentId: string): Promise<EquippedSkill[]> {
  const res = await restClient.get<{ data: EquippedSkill[] }>(
    `/api/agents/${agentId}/workshop/equipped`,
  );
  return res.data;
}

export async function equipSkill(agentId: string, skillId: string): Promise<EquippedSkill> {
  const res = await restClient.post<{ data: EquippedSkill }>(
    `/api/agents/${agentId}/workshop/equip`,
    { skillId },
  );
  return res.data;
}

export async function unequipSkill(agentId: string, skillId: string): Promise<void> {
  await restClient.delete(`/api/agents/${agentId}/workshop/unequip/${skillId}`);
}

export async function getSuggestions(agentId: string): Promise<MarketplaceSuggestion[]> {
  const res = await restClient.get<{ data: MarketplaceSuggestion[] }>(
    `/api/agents/${agentId}/workshop/suggestions`,
  );
  return res.data;
}

export async function resetWorkshopSession(agentId: string): Promise<void> {
  await restClient.post(`/api/agents/${agentId}/workshop/reset`, {});
}

export async function getInstalledSkills(agentId: string): Promise<EquippedSkill[]> {
  const res = await restClient.get<{ data: EquippedSkill[] }>(
    `/api/agents/${agentId}/workshop/installed`,
  );
  return res.data;
}

export async function saveWorkshopSkills(agentId: string): Promise<{ savedCount: number }> {
  const res = await restClient.post<{ data: { savedCount: number } }>(
    `/api/agents/${agentId}/workshop/save`,
  );
  return res.data;
}

/**
 * Install a skill from the marketplace and return its ID.
 * Reuses the existing marketplace install endpoint.
 */
export async function installMarketplaceSkill(installRef: string): Promise<{
  skillId: string;
  name: string;
  displayName: string;
}> {
  const res = await restClient.post<{ data: { skillId: string; name: string; displayName: string } }>(
    '/api/skills/marketplace/install',
    { installRef },
  );
  return res.data;
}

/**
 * Consolidate workspace skills created by skill-creator into persisted skills.
 * Returns created skills (to equip) or a flag indicating skill-creator should be invoked.
 */
export async function consolidateChatToSkill(
  agentId: string,
): Promise<{
  created: Array<{
    id: string; name: string; displayName: string;
    description: string | null; version: string;
  }>;
  needsSkillCreator: boolean;
}> {
  const res = await restClient.post<{ data: {
    created: Array<{
      id: string; name: string; displayName: string;
      description: string | null; version: string;
    }>;
    needsSkillCreator: boolean;
  } }>(
    `/api/agents/${agentId}/workshop/consolidate`,
  );
  return res.data;
}

/**
 * Stream a workshop chat message via SSE.
 * Returns a reader handle for the SSE stream.
 */
export function streamWorkshopChat(
  agentId: string,
  message: string,
  sessionId?: string,
  systemPromptOverride?: string,
): { reader: Promise<ReadableStreamDefaultReader<Uint8Array>>; abort: () => void } {
  const controller = new AbortController();
  const token = getAuthToken();

  const body: Record<string, unknown> = { message, sessionId };
  if (systemPromptOverride) {
    body.systemPromptOverride = systemPromptOverride;
  }

  const readerPromise = fetch(`${API_BASE_URL}/api/agents/${agentId}/workshop/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(res => {
    if (!res.ok) throw new Error(`Workshop chat failed: ${res.status}`);
    if (!res.body) throw new Error('No response body');
    return res.body.getReader();
  });

  return {
    reader: readerPromise,
    abort: () => controller.abort(),
  };
}
