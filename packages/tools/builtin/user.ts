/**
 * User Interaction Tools
 *
 * Tools for asking questions and getting confirmations from users.
 * Uses events to communicate with the API/CLI layer.
 */

import { EventEmitter } from 'events';
import { Logger } from '@kloudi/shared/logger';
import type { ToolDefinition, ToolContext } from '@kloudi/shared/types';

const logger = Logger.getInstance('tools:user');

// Global event emitter for user interactions
export const userEvents = new EventEmitter();

/**
 * Extended context with timeout
 */
interface UserContext extends ToolContext {
  timeout?: number;
}

/**
 * User ask parameters
 */
interface UserAskParams {
  question: string;
  placeholder?: string;
  defaultValue?: string;
}

/**
 * User ask result
 */
interface UserAskResult {
  answer: string;
}

/**
 * User confirm parameters
 */
interface UserConfirmParams {
  message: string;
  defaultValue?: boolean;
}

/**
 * User confirm result
 */
interface UserConfirmResult {
  confirmed: boolean;
}

/**
 * User ask event data
 */
interface UserAskEvent {
  requestId: string;
  question: string;
  placeholder?: string | undefined;
  defaultValue?: string | undefined;
  timestamp: string;
}

/**
 * User confirm event data
 */
interface UserConfirmEvent {
  requestId: string;
  message: string;
  defaultValue: boolean;
  timestamp: string;
}

/**
 * Pending request handler
 */
interface PendingRequest {
  resolve: (value: string | boolean) => void;
  reject: (error: Error) => void;
  type: 'ask' | 'confirm';
}

/**
 * User response data
 */
interface UserResponse {
  error?: string;
  confirmed?: boolean;
  answer?: string;
  value?: string | boolean;
}

// Pending user requests (keyed by requestId)
const pendingRequests = new Map<string, PendingRequest>();

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * user.ask - Ask the user a question and wait for their response
 */
export const userAsk: ToolDefinition = {
  name: 'user.ask',
  description: 'Ask the user a question and wait for their text response',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
      placeholder: {
        type: 'string',
        description: 'Optional placeholder text for the input',
      },
      defaultValue: {
        type: 'string',
        description: 'Optional default value',
      },
    },
    required: ['question'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext = {}
  ): Promise<UserAskResult> {
    const { question, placeholder, defaultValue } =
      params as unknown as UserAskParams;
    const requestId = generateRequestId();
    const userContext = context as UserContext;
    const timeout = userContext.timeout || 300000; // 5 minute default

    logger.debug(`user.ask: ${question}`, { requestId });

    return new Promise<UserAskResult>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('User response timeout'));
      }, timeout);

      // Store the pending request
      pendingRequests.set(requestId, {
        resolve: (answer: string | boolean) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          logger.debug(`user.ask answered`, { requestId });
          resolve({ answer: String(answer) });
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          reject(error);
        },
        type: 'ask',
      });

      // Emit event for the UI layer to handle
      const event: UserAskEvent = {
        requestId,
        question,
        placeholder,
        defaultValue,
        timestamp: new Date().toISOString(),
      };
      userEvents.emit('user.ask', event);
    });
  },
};

/**
 * user.confirm - Ask the user a yes/no question
 */
export const userConfirm: ToolDefinition = {
  name: 'user.confirm',
  description: 'Ask the user a yes/no confirmation question',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The confirmation message to show',
      },
      defaultValue: {
        type: 'boolean',
        description: 'Default value if user just presses enter',
      },
    },
    required: ['message'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext = {}
  ): Promise<UserConfirmResult> {
    const { message, defaultValue = false } =
      params as unknown as UserConfirmParams;
    const requestId = generateRequestId();
    const userContext = context as UserContext;
    const timeout = userContext.timeout || 300000; // 5 minute default

    logger.debug(`user.confirm: ${message}`, { requestId });

    return new Promise<UserConfirmResult>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('User confirmation timeout'));
      }, timeout);

      // Store the pending request
      pendingRequests.set(requestId, {
        resolve: (confirmed: string | boolean) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          logger.debug(`user.confirm answered: ${confirmed}`, { requestId });
          resolve({ confirmed: Boolean(confirmed) });
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          reject(error);
        },
        type: 'confirm',
      });

      // Emit event for the UI layer to handle
      const event: UserConfirmEvent = {
        requestId,
        message,
        defaultValue,
        timestamp: new Date().toISOString(),
      };
      userEvents.emit('user.confirm', event);
    });
  },
};

/**
 * Respond to a pending user request
 * Called by the API/CLI layer when user provides input
 */
export function respondToUserRequest(
  requestId: string,
  response: UserResponse
): boolean {
  const pending = pendingRequests.get(requestId);

  if (!pending) {
    logger.warn(`No pending request found for: ${requestId}`);
    return false;
  }

  if (response.error) {
    pending.reject(new Error(response.error));
  } else if (pending.type === 'confirm') {
    pending.resolve(response.confirmed ?? response.value ?? false);
  } else {
    pending.resolve(response.answer ?? response.value ?? '');
  }

  return true;
}

/**
 * Cancel a pending user request
 */
export function cancelUserRequest(requestId: string): boolean {
  const pending = pendingRequests.get(requestId);

  if (!pending) {
    return false;
  }

  pending.reject(new Error('Request cancelled'));
  return true;
}

/**
 * Get all pending requests (for debugging/management)
 */
export function getPendingRequests(): string[] {
  return Array.from(pendingRequests.keys());
}

// Export all tools as an array for easy registration
export const userTools: ToolDefinition[] = [userAsk, userConfirm];

export default userTools;
