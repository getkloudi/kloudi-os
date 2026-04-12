'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import type { AgentMessage } from '@/types';

interface AgentPanelProps {
  messages: AgentMessage[];
  collapsed: boolean;
  onToggle: () => void;
  onCommand?: (command: string) => void;
}

type Tab = 'terminal' | 'context' | 'history';

export function AgentPanel({ messages, collapsed, onToggle, onCommand }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('terminal');
  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  if (collapsed) return null;

  const tabs: Tab[] = ['terminal', 'context', 'history'];

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-0)] transition-[width] duration-200">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-1)] px-4 py-3">
        <span className="text-[13px] font-semibold text-[var(--text-1)]">Agent</span>
        <button
          onClick={onToggle}
          className="cursor-pointer border-none bg-none text-base text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-[var(--border)] bg-[var(--bg-1)]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'relative cursor-pointer border-none bg-transparent px-3.5 py-1.5 font-mono text-[11px] text-[var(--text-3)]',
              activeTab === tab && 'text-[var(--text-1)]',
              activeTab === tab && 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto bg-[var(--bg-0)] p-3.5 font-mono text-xs leading-[1.8] text-[var(--text-2)]"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="mb-3.5">
            <div className="mb-[3px] flex items-center gap-1.5">
              <span
                className={cn(
                  'text-[10px] font-semibold',
                  msg.role === 'agent' && 'text-[var(--accent)]',
                  msg.role === 'system' && 'text-[var(--green)]',
                  msg.role === 'user' && 'text-[var(--text-1)]'
                )}
              >
                {msg.role}
              </span>
              <span className="text-[9px] text-[var(--text-4)]">{msg.timestamp}</span>
            </div>
            <div
              className="text-xs leading-[1.7] text-[var(--text-2)]"
              dangerouslySetInnerHTML={{ __html: msg.content }}
            />
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-1)] px-4 py-2.5">
        <span className="font-mono text-[13px] text-[var(--accent)]">❯</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              onCommand?.(input.trim());
              setInput('');
            }
          }}
          placeholder="Ask, run, or command..."
          className="flex-1 border-none bg-transparent font-mono text-xs text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
        />
      </div>
    </aside>
  );
}
