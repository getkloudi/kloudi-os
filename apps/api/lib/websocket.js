/**
 * WebSocket Setup
 *
 * Real-time communication for lore.dev execution progress
 * and user interactions.
 */

import { WebSocketServer } from 'ws';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('websocket');

// Store active connections
const clients = new Map();

// Store pending user.ask requests
const pendingAsks = new Map();

/**
 * Initialize WebSocket server on existing HTTP server
 */
export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    clients.set(clientId, ws);

    logger.info('WebSocket client connected', {
      context: 'ws-connect',
      clientId,
      ip: req.socket.remoteAddress,
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString(),
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(clientId, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', error, {
          context: 'ws-parse-error',
          clientId,
        });
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      clients.delete(clientId);
      logger.info('WebSocket client disconnected', {
        context: 'ws-disconnect',
        clientId,
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', error, {
        context: 'ws-error',
        clientId,
      });
    });
  });

  logger.info('WebSocket server initialized', {
    context: 'ws-init',
    path: '/ws',
  });

  return wss;
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(clientId, message) {
  const { type, payload } = message;

  switch (type) {
    case 'user.ask.response':
      handleAskResponse(payload);
      break;

    case 'subscribe':
      handleSubscribe(clientId, payload);
      break;

    case 'unsubscribe':
      handleUnsubscribe(clientId, payload);
      break;

    case 'ping':
      sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
      break;

    default:
      logger.warn('Unknown WebSocket message type', {
        context: 'ws-unknown-type',
        clientId,
        type,
      });
  }
}

/**
 * Handle user.ask response
 */
function handleAskResponse(payload) {
  const { askId, response } = payload;
  const pending = pendingAsks.get(askId);

  if (pending) {
    pending.resolve(response);
    pendingAsks.delete(askId);
    logger.info('User ask response received', {
      context: 'ws-ask-response',
      askId,
    });
  }
}

/**
 * Handle subscription to execution updates
 */
function handleSubscribe(clientId, payload) {
  const { executionId } = payload;
  const client = clients.get(clientId);
  if (client) {
    client.subscriptions = client.subscriptions || new Set();
    client.subscriptions.add(executionId);
    logger.info('Client subscribed to execution', {
      context: 'ws-subscribe',
      clientId,
      executionId,
    });
  }
}

/**
 * Handle unsubscription
 */
function handleUnsubscribe(clientId, payload) {
  const { executionId } = payload;
  const client = clients.get(clientId);
  if (client && client.subscriptions) {
    client.subscriptions.delete(executionId);
  }
}

/**
 * Send message to specific client
 */
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.readyState === 1) {
    client.send(JSON.stringify(message));
  }
}

/**
 * Broadcast execution progress to subscribed clients
 */
export function emitExecutionProgress(executionId, progress) {
  const message = JSON.stringify({
    type: 'execution.progress',
    executionId,
    ...progress,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws, clientId) => {
    if (ws.subscriptions?.has(executionId) && ws.readyState === 1) {
      ws.send(message);
    }
  });
}

/**
 * Broadcast execution completion
 */
export function emitExecutionComplete(executionId, result) {
  const message = JSON.stringify({
    type: 'execution.complete',
    executionId,
    result,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws) => {
    if (ws.subscriptions?.has(executionId) && ws.readyState === 1) {
      ws.send(message);
    }
  });
}

/**
 * Request user input via WebSocket
 * Returns a promise that resolves when user responds
 */
export function requestUserInput(clientId, question, options = {}) {
  return new Promise((resolve, reject) => {
    const askId = generateAskId();
    const timeout = options.timeout || 300000; // 5 minute default

    pendingAsks.set(askId, { resolve, reject });

    sendToClient(clientId, {
      type: 'user.ask',
      askId,
      question,
      options,
      timestamp: new Date().toISOString(),
    });

    // Timeout handler
    setTimeout(() => {
      if (pendingAsks.has(askId)) {
        pendingAsks.delete(askId);
        reject(new Error('User input timeout'));
      }
    }, timeout);
  });
}

/**
 * Broadcast to all connected clients
 */
export function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });
}

/**
 * Generate unique client ID
 */
function generateClientId() {
  return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate unique ask ID
 */
function generateAskId() {
  return 'ask_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export default setupWebSocket;
