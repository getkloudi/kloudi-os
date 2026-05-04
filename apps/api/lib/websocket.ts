/**
 * WebSocket Setup
 *
 * Real-time communication for lore.dev execution progress
 * and user interactions.
 */

import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('websocket');

interface ExtendedWebSocket extends WebSocket {
  subscriptions?: Set<string>;
}

interface WebSocketMessage {
  type: string;
  payload?: MessagePayload;
}

interface MessagePayload {
  askId?: string;
  response?: string;
  executionId?: string;
}

interface PendingAsk {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

interface AskOptions {
  timeout?: number;
}

interface BroadcastMessage {
  type: string;
  [key: string]: unknown;
}

interface ExecutionProgress {
  [key: string]: unknown;
}

// Store active connections
const clients = new Map<string, ExtendedWebSocket>();

// Store pending user.ask requests
const pendingAsks = new Map<string, PendingAsk>();

/**
 * Initialize WebSocket server on existing HTTP server
 */
export function setupWebSocket(server: Server | null): WebSocketServer | null {
  if (!server) {
    logger.warn('No HTTP server provided for WebSocket setup');
    return null;
  }

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ExtendedWebSocket, req: IncomingMessage) => {
    const clientId = generateClientId();
    clients.set(clientId, ws);

    logger.info('WebSocket client connected', {
      context: 'ws-connect',
      clientId,
      ip: req.socket.remoteAddress,
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
      })
    );

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        handleMessage(clientId, message);
      } catch (error) {
        logger.error(
          'Failed to parse WebSocket message',
          error instanceof Error ? error : null,
          {
            context: 'ws-parse-error',
            clientId,
          }
        );
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
    ws.on('error', (error: Error) => {
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
function handleMessage(clientId: string, message: WebSocketMessage): void {
  const { type, payload } = message;

  switch (type) {
    case 'user.ask.response':
      if (payload) handleAskResponse(payload);
      break;

    case 'subscribe':
      if (payload) handleSubscribe(clientId, payload);
      break;

    case 'unsubscribe':
      if (payload) handleUnsubscribe(clientId, payload);
      break;

    case 'ping':
      sendToClient(clientId, {
        type: 'pong',
        timestamp: new Date().toISOString(),
      });
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
function handleAskResponse(payload: MessagePayload): void {
  const { askId, response } = payload;
  if (!askId) return;

  const pending = pendingAsks.get(askId);

  if (pending && response !== undefined) {
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
function handleSubscribe(clientId: string, payload: MessagePayload): void {
  const { executionId } = payload;
  if (!executionId) return;

  const client = clients.get(clientId);
  if (client) {
    client.subscriptions = client.subscriptions ?? new Set();
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
function handleUnsubscribe(clientId: string, payload: MessagePayload): void {
  const { executionId } = payload;
  if (!executionId) return;

  const client = clients.get(clientId);
  if (client?.subscriptions) {
    client.subscriptions.delete(executionId);
  }
}

/**
 * Send message to specific client
 */
function sendToClient(clientId: string, message: BroadcastMessage): void {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

/**
 * Broadcast execution progress to subscribed clients
 */
export function emitExecutionProgress(
  executionId: string,
  progress: ExecutionProgress
): void {
  const message = JSON.stringify({
    type: 'execution.progress',
    executionId,
    ...progress,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws: ExtendedWebSocket, _clientId: string) => {
    if (
      ws.subscriptions?.has(executionId) &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(message);
    }
  });
}

/**
 * Broadcast execution completion
 */
export function emitExecutionComplete(
  executionId: string,
  result: unknown
): void {
  const message = JSON.stringify({
    type: 'execution.complete',
    executionId,
    result,
    timestamp: new Date().toISOString(),
  });

  clients.forEach((ws: ExtendedWebSocket) => {
    if (
      ws.subscriptions?.has(executionId) &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(message);
    }
  });
}

/**
 * Request user input via WebSocket
 * Returns a promise that resolves when user responds
 */
export function requestUserInput(
  clientId: string,
  question: string,
  options: AskOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const askId = generateAskId();
    const timeout = options.timeout ?? 300000; // 5 minute default

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
 * Request trust gate approval from all clients subscribed to an execution.
 * Broadcasts user.ask to subscribers and waits for any response.
 */
export function requestTrustGateApproval(
  executionId: string,
  gateContext: Record<string, unknown>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const askId = generateAskId();
    const timeout = 300000; // 5 min

    pendingAsks.set(askId, { resolve, reject });

    const message = JSON.stringify({
      type: 'user.ask',
      askId,
      question: `Trust gate: ${gateContext['action'] ?? 'Approval needed'}`,
      options: gateContext,
      timestamp: new Date().toISOString(),
    });

    clients.forEach((ws: ExtendedWebSocket) => {
      if (
        ws.subscriptions?.has(executionId) &&
        ws.readyState === WebSocket.OPEN
      ) {
        ws.send(message);
      }
    });

    setTimeout(() => {
      if (pendingAsks.has(askId)) {
        pendingAsks.delete(askId);
        reject(new Error('Trust gate approval timeout'));
      }
    }, timeout);
  });
}

/**
 * Broadcast to all connected clients
 */
export function broadcast(message: BroadcastMessage): void {
  const data = JSON.stringify(message);
  clients.forEach((ws: ExtendedWebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return (
    'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
  );
}

/**
 * Generate unique ask ID
 */
function generateAskId(): string {
  return (
    'ask_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
  );
}

export default setupWebSocket;
