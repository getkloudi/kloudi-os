'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, TreeNode } from '@/components/sidebar';
import { EntityPanel, EntityData, ExecutionLog } from '@/components/entity-panel';
import { Omnibox, CommandItem, useOmnibox } from '@/components/omnibox';
import { Command, LogOut, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function flattenTree(nodes: TreeNode[]): CommandItem[] {
  const result: CommandItem[] = [];

  function traverse(items: TreeNode[]) {
    for (const item of items) {
      if (item.type !== 'folder') {
        result.push({
          id: item.id,
          name: item.name,
          type: item.type,
        });
      }
      if (item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(nodes);
  return result;
}

export default function Home() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [procedures, setProcedures] = useState<TreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [entity, setEntity] = useState<EntityData | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const omnibox = useOmnibox();

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load procedures tree from API on mount (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function loadProcedures() {
      try {
        setLoading(true);
        setError(undefined);
        const tree = await api.getProcedureTree();
        if (!cancelled) {
          setProcedures(tree);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load procedures:', err);
          setError('Failed to load procedures. Make sure the API server is running.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProcedures();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Load entity detail when selection changes
  useEffect(() => {
    if (!selectedId || !isAuthenticated) return;

    let cancelled = false;

    async function loadEntity() {
      try {
        const detail = await api.getProcedureDetail(selectedId!);
        if (!cancelled) {
          setEntity(detail as EntityData);
          setLogs([]);
        }
      } catch (err) {
        console.error('Failed to load procedure detail:', err);
        if (!cancelled) {
          setEntity(undefined);
        }
      }
    }

    loadEntity();
    return () => { cancelled = true; };
  }, [selectedId, isAuthenticated]);

  const handleRun = useCallback(async (id: string) => {
    setIsRunning(true);
    setLogs([]);

    try {
      const execution = await api.executeProcedure(id);

      // Add initial log
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'info',
        message: execution.message || 'Execution started...',
      }]);

      // Poll for execution status updates
      const executionId = execution.id;
      let pollCount = 0;
      const maxPolls = 30; // Max 30 seconds of polling

      const poll = async () => {
        try {
          const status = await api.getExecution(executionId);

          if (status.logs && status.logs.length > 0) {
            setLogs(status.logs as ExecutionLog[]);
          }

          if (status.status === 'completed') {
            setIsRunning(false);
            if (entity) {
              setEntity({ ...entity, status: 'completed' });
            }
            return;
          }

          if (status.status === 'failed') {
            setIsRunning(false);
            if (entity) {
              setEntity({ ...entity, status: 'failed' });
            }
            return;
          }

          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(poll, 1000);
          } else {
            setIsRunning(false);
          }
        } catch (err) {
          console.error('Failed to poll execution status:', err);
          setIsRunning(false);
        }
      };

      // Start polling after a short delay
      setTimeout(poll, 1000);
    } catch (err) {
      console.error('Failed to start execution:', err);
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Failed to start execution',
      }]);
      setIsRunning(false);
    }
  }, [entity]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const commandItems = flattenTree(procedures);

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  // Will redirect to login
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={procedures}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
      <main className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p>Loading procedures...</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-red-400">{error}</p>
              <p className="mt-2 text-sm">Run the API server with: pnpm dev:api</p>
            </div>
          </div>
        ) : (
          <EntityPanel
            entity={entity}
            onRun={handleRun}
            isRunning={isRunning}
            logs={logs}
          />
        )}
      </main>

      {/* User menu */}
      <div className="fixed top-4 right-4 z-10">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
          <User className="h-4 w-4" />
          <span className="max-w-[120px] truncate">{user?.username || user?.email}</span>
          <button
            onClick={logout}
            className="ml-1 rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Command palette trigger hint */}
      <div className="fixed bottom-4 right-4">
        <button
          onClick={omnibox.open}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Command className="h-4 w-4" />
          <span>Search</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">
            {'\u2318'}K
          </kbd>
        </button>
      </div>

      <Omnibox
        items={commandItems}
        onSelect={handleSelect}
        onClose={omnibox.close}
        isOpen={omnibox.isOpen}
      />
    </div>
  );
}
