'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { TrustGateEvent, ActivityPost } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

type WSMessage =
  | { type: 'trust_gate'; data: TrustGateEvent }
  | { type: 'activity'; data: ActivityPost }
  | { type: 'execution_update'; data: { executionId: string; status: string; nodeId?: string } };

interface UseWebSocketOptions {
  onTrustGate?: (event: TrustGateEvent) => void;
  onActivity?: (post: ActivityPost) => void;
  onExecutionUpdate?: (data: { executionId: string; status: string; nodeId?: string }) => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) return;

    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        switch (msg.type) {
          case 'trust_gate':
            optionsRef.current.onTrustGate?.(msg.data);
            break;
          case 'activity':
            optionsRef.current.onActivity?.(msg.data);
            break;
          case 'execution_update':
            optionsRef.current.onExecutionUpdate?.(msg.data);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const sendTrustGateResponse = useCallback(
    (executionId: string, nodeId: string, approved: boolean) => {
      wsRef.current?.send(
        JSON.stringify({
          type: 'trust_gate_response',
          data: { executionId, nodeId, approved },
        })
      );
    },
    []
  );

  return { connected, sendTrustGateResponse };
}
