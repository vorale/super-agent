/**
 * Business Scope Service
 * 
 * This module provides the unified business scope service that automatically switches
 * between mock and REST API implementations based on environment configuration.
 * 
 * Requirements: 4.4, 4.5, 11.6
 */

import { getServiceConfig } from './api/createService';
import { RestBusinessScopeService } from './api/restBusinessScopeService';
import { shouldUseRestApi } from './api/index';

// Business scope types
export interface BusinessScope {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  visibility: 'open' | 'restricted';
  createdAt: Date;
  updatedAt: Date;
  scopeType?: string;
  avatar?: string | null;
  role?: string | null;
  systemPrompt?: string | null;
  settings?: Record<string, unknown> | null;
}

export interface CreateBusinessScopeInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export interface UpdateBusinessScopeInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

// Re-export error types for backward compatibility
export type BusinessScopeServiceErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN';

export class BusinessScopeServiceError extends Error {
  code: BusinessScopeServiceErrorCode;

  constructor(message: string, code: BusinessScopeServiceErrorCode) {
    super(message);
    this.name = 'BusinessScopeServiceError';
    this.code = code;
  }
}

// Simulated network delay for realistic behavior in mock mode
const SIMULATED_DELAY = 300;

// Mock data for development
const mockBusinessScopes: BusinessScope[] = [
  {
    id: 'scope-1',
    organizationId: 'org-1',
    name: 'Human Resources',
    description: 'HR department operations and employee management',
    icon: '👥',
    color: '#4CAF50',
    isDefault: true,
    visibility: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'scope-2',
    organizationId: 'org-1',
    name: 'Information Technology',
    description: 'IT support and infrastructure management',
    icon: '💻',
    color: '#2196F3',
    isDefault: true,
    visibility: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'scope-3',
    organizationId: 'org-1',
    name: 'Marketing',
    description: 'Marketing campaigns and brand management',
    icon: '📢',
    color: '#FF9800',
    isDefault: true,
    visibility: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'scope-4',
    organizationId: 'org-1',
    name: 'Sales',
    description: 'Sales operations and customer acquisition',
    icon: '💰',
    color: '#9C27B0',
    isDefault: true,
    visibility: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'scope-5',
    organizationId: 'org-1',
    name: 'Customer Support',
    description: 'Customer service and support operations',
    icon: '🎧',
    color: '#E91E63',
    isDefault: true,
    visibility: 'open' as const,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

// In-memory store for mock data (simulates backend persistence)
let businessScopeStore: BusinessScope[] = [...mockBusinessScopes];

// Helper to simulate async operations
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to generate unique IDs
function generateId(): string {
  return `scope-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Mock implementation of the Business Scope Service
 * Used in development mode when VITE_USE_MOCK=true
 */
export const MockBusinessScopeService = {
  /**
   * Retrieves all business scopes from the system
   */
  async getBusinessScopes(): Promise<BusinessScope[]> {
    await delay(SIMULATED_DELAY);
    return [...businessScopeStore].sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Retrieves a single business scope by ID
   * @throws BusinessScopeServiceError if business scope not found
   */
  async getBusinessScopeById(id: string): Promise<BusinessScope> {
    await delay(SIMULATED_DELAY);
    const scope = businessScopeStore.find(s => s.id === id);
    if (!scope) {
      throw new BusinessScopeServiceError(`Business scope with id "${id}" not found`, 'NOT_FOUND');
    }
    return { ...scope };
  },

  /**
   * Creates a new business scope with uniqueness validation
   * @throws BusinessScopeServiceError if name already exists in the organization
   */
  async createBusinessScope(input: CreateBusinessScopeInput): Promise<BusinessScope> {
    await delay(SIMULATED_DELAY);
    
    // Validate required fields
    if (!input.name || input.name.trim() === '') {
      throw new BusinessScopeServiceError('Business scope name cannot be empty', 'VALIDATION_ERROR');
    }
    
    const trimmedName = input.name.trim();
    
    // Check for uniqueness (case-insensitive)
    const existingScope = businessScopeStore.find(
      s => s.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (existingScope) {
      throw new BusinessScopeServiceError(
        `A business scope with name "${trimmedName}" already exists in this organization`,
        'VALIDATION_ERROR'
      );
    }
    
    const now = new Date();
    const newScope: BusinessScope = {
      id: generateId(),
      organizationId: 'org-1', // Mock organization ID
      name: trimmedName,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      isDefault: input.isDefault ?? false,
      visibility: 'open',
      createdAt: now,
      updatedAt: now,
    };
    
    businessScopeStore.push(newScope);
    return { ...newScope };
  },

  /**
   * Updates an existing business scope
   * @throws BusinessScopeServiceError if business scope not found or validation fails
   */
  async updateBusinessScope(id: string, input: UpdateBusinessScopeInput): Promise<BusinessScope> {
    await delay(SIMULATED_DELAY);
    
    const index = businessScopeStore.findIndex(s => s.id === id);
    if (index === -1) {
      throw new BusinessScopeServiceError(`Business scope with id "${id}" not found`, 'NOT_FOUND');
    }
    
    // Validate name if provided
    if (input.name !== undefined && input.name.trim() === '') {
      throw new BusinessScopeServiceError('Business scope name cannot be empty', 'VALIDATION_ERROR');
    }
    
    // Check for uniqueness if name is being changed
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      const existingScope = businessScopeStore.find(
        s => s.id !== id && s.name.toLowerCase() === trimmedName.toLowerCase()
      );
      
      if (existingScope) {
        throw new BusinessScopeServiceError(
          `A business scope with name "${trimmedName}" already exists in this organization`,
          'VALIDATION_ERROR'
        );
      }
    }
    
    const updatedScope: BusinessScope = {
      ...businessScopeStore[index],
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      updatedAt: new Date(),
    };
    
    businessScopeStore[index] = updatedScope;
    return { ...updatedScope };
  },

  /**
   * Deletes a business scope
   * @throws BusinessScopeServiceError if business scope not found
   */
  async deleteBusinessScope(id: string): Promise<void> {
    await delay(SIMULATED_DELAY);
    
    const index = businessScopeStore.findIndex(s => s.id === id);
    if (index === -1) {
      throw new BusinessScopeServiceError(`Business scope with id "${id}" not found`, 'NOT_FOUND');
    }
    
    businessScopeStore.splice(index, 1);
  },

  /**
   * Retrieves default business scopes
   */
  async getDefaultBusinessScopes(): Promise<BusinessScope[]> {
    await delay(SIMULATED_DELAY);
    return businessScopeStore
      .filter(s => s.isDefault)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => ({ ...s }));
  },

  /**
   * Resets the business scope store to initial mock data (useful for testing)
   */
  resetStore(): void {
    businessScopeStore = [...mockBusinessScopes];
  },

  /**
   * Gets the initial mock business scopes (useful for testing)
   */
  getMockBusinessScopes(): BusinessScope[] {
    return [...mockBusinessScopes];
  },
};

/**
 * Business Scope Service Interface
 * Defines the contract that both mock and Supabase implementations must follow
 */
export interface IBusinessScopeService {
  getBusinessScopes(): Promise<BusinessScope[]>;
  getBusinessScopeById(id: string): Promise<BusinessScope>;
  createBusinessScope(input: CreateBusinessScopeInput): Promise<BusinessScope>;
  updateBusinessScope(id: string, input: UpdateBusinessScopeInput): Promise<BusinessScope>;
  deleteBusinessScope(id: string): Promise<void>;
  getDefaultBusinessScopes?(): Promise<BusinessScope[]>;
  resetStore?(): void;
  getMockBusinessScopes?(): BusinessScope[];
}

/**
 * Unified Business Scope Service
 * 
 * Automatically switches between mock and REST API implementations
 * based on environment variables:
 * 
 * - When VITE_API_MODE=rest: Uses RestBusinessScopeService (REST API backend)
 * - When VITE_USE_MOCK=true (or in development without explicit setting): Uses MockBusinessScopeService
 * 
 * Requirements: 11.6
 */
function selectBusinessScopeService(): IBusinessScopeService {
  if (shouldUseRestApi()) {
    return RestBusinessScopeService as unknown as IBusinessScopeService;
  }
  const config = getServiceConfig();
  return config.useMock ? MockBusinessScopeService : (RestBusinessScopeService as unknown as IBusinessScopeService);
}

export const BusinessScopeService = selectBusinessScopeService();

export default BusinessScopeService;
