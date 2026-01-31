/**
 * User Interaction Tools
 *
 * Tools for asking questions and getting confirmations from users.
 * Uses events to communicate with the API/CLI layer.
 */

import { EventEmitter } from 'events';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:user');

// Global event emitter for user interactions
export const userEvents = new EventEmitter();

// Pending user requests (keyed by requestId)
const pendingRequests = new Map();

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * user.ask - Ask the user a question and wait for their response
 */
export const userAsk = {
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

  async execute(params, context = {}) {
    const { question, placeholder, defaultValue } = params;
    const requestId = generateRequestId();
    const timeout = context.timeout || 300000; // 5 minute default

    logger.debug(`user.ask: ${question}`, { requestId });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('User response timeout'));
      }, timeout);

      // Store the pending request
      pendingRequests.set(requestId, {
        resolve: (answer) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          logger.debug(`user.ask answered`, { requestId });
          resolve({ answer });
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          reject(error);
        },
        type: 'ask',
      });

      // Emit event for the UI layer to handle
      userEvents.emit('user.ask', {
        requestId,
        question,
        placeholder,
        defaultValue,
        timestamp: new Date().toISOString(),
      });
    });
  },
};

/**
 * user.confirm - Ask the user a yes/no question
 */
export const userConfirm = {
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

  async execute(params, context = {}) {
    const { message, defaultValue = false } = params;
    const requestId = generateRequestId();
    const timeout = context.timeout || 300000; // 5 minute default

    logger.debug(`user.confirm: ${message}`, { requestId });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('User confirmation timeout'));
      }, timeout);

      // Store the pending request
      pendingRequests.set(requestId, {
        resolve: (confirmed) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          logger.debug(`user.confirm answered: ${confirmed}`, { requestId });
          resolve({ confirmed });
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          pendingRequests.delete(requestId);
          reject(error);
        },
        type: 'confirm',
      });

      // Emit event for the UI layer to handle
      userEvents.emit('user.confirm', {
        requestId,
        message,
        defaultValue,
        timestamp: new Date().toISOString(),
      });
    });
  },
};

/**
 * Respond to a pending user request
 * Called by the API/CLI layer when user provides input
 */
export function respondToUserRequest(requestId, response) {
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
export function cancelUserRequest(requestId) {
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
export function getPendingRequests() {
  return Array.from(pendingRequests.keys());
}

// Export all tools as an array for easy registration
export const userTools = [userAsk, userConfirm];

export default userTools;
