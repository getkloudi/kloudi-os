'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useWebSocket } from '@/lib/hooks/use-websocket';
import { NavRail } from '@/components/nav-rail';
import { HomeSpace, type QuickAccessItem } from '@/components/spaces/home-space';
import { BrowseSpace } from '@/components/spaces/browse-space';
import { EditorSpace } from '@/components/spaces/editor-space';
import { StoreSpace } from '@/components/spaces/store-space';
import { Omnibox, useOmnibox } from '@/components/omnibox';
import { TrustGateDialog } from '@/components/trust-gate-dialog';
import type {
  Space,
  ActivityPost,
  ProcedureFile,
  ExecutionDetail,
  StoreApp,
  AgentMessage,
  TrustGateEvent,
  ExecutionStatus,
} from '@/types';
import type { CommandItem, TreeNode } from '@/lib/api';

function flattenTree(nodes: TreeNode[]): CommandItem[] {
  const result: CommandItem[] = [];
  function traverse(items: TreeNode[]) {
    for (const item of items) {
      if (item.type !== 'folder') {
        result.push({ id: item.id, name: item.name, type: item.type });
      }
      if (item.children) traverse(item.children);
    }
  }
  traverse(nodes);
  return result;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Mock data for development — these will come from the API when endpoints are ready
function getMockPosts(): ActivityPost[] {
  return [
    {
      id: '1',
      type: 'execution_run',
      user: { username: 'sarah', initials: 'S' },
      procedure: { id: 'p1', name: 'deploy-auth-flow', slug: 'engineering/deploy-auth-flow' },
      execution: {
        id: 'exec_9kp2',
        status: 'running' as ExecutionStatus,
        progress: 55,
        nodes: [
          { id: 'n1', label: 'Validate Config', type: 'tool_call', status: 'completed' as ExecutionStatus, duration: '0.4s' },
          { id: 'n2', label: 'Generate Auth Module', type: 'llm_generate', status: 'completed' as ExecutionStatus, duration: '2.1s' },
          { id: 'n3', label: 'Deploy to Staging', type: 'tool_call', status: 'running' as ExecutionStatus },
          { id: 'n4', label: 'Verify Health', type: 'tool_call', status: 'pending' as ExecutionStatus },
        ],
      },
      reactions: [{ emoji: '👀', count: 2 }],
      replyCount: 0,
      timestamp: new Date().toISOString(),
      relativeTime: 'now',
    },
    {
      id: '2',
      type: 'execution_completed',
      user: { username: 'nitish', initials: 'N' },
      procedure: { id: 'p2', name: 'analyze-codebase', slug: 'engineering/analyze-codebase' },
      execution: {
        id: 'exec_clx8k2m',
        status: 'completed' as ExecutionStatus,
        progress: 100,
        tokens: 2847,
        duration: '4.2s',
      },
      reactions: [{ emoji: '✅', count: 1 }],
      replyCount: 0,
      timestamp: new Date(Date.now() - 120000).toISOString(),
      relativeTime: '2m ago',
    },
    {
      id: '3',
      type: 'execution_failed',
      user: { username: 'alex', initials: 'A' },
      procedure: { id: 'p3', name: 'migrate-database', slug: 'engineering/migrate-database' },
      execution: {
        id: 'exec_fail1',
        status: 'failed' as ExecutionStatus,
        progress: 25,
        error: 'LLM timeout',
      },
      replyCount: 3,
      timestamp: new Date(Date.now() - 1080000).toISOString(),
      relativeTime: '18m ago',
    },
    {
      id: '4',
      type: 'awaiting_approval',
      user: { username: 'sarah', initials: 'S' },
      procedure: { id: 'p4', name: 'security-review', slug: 'engineering/security-review' },
      execution: {
        id: 'exec_wait1',
        status: 'waiting_input' as ExecutionStatus,
        progress: 60,
      },
      trustGate: {
        id: 'tg1',
        question: "Node 'deep-scan' about to run again (visit #3). Continue?",
        nodeLabel: 'deep-scan',
        visitCount: 3,
      },
      timestamp: new Date(Date.now() - 2520000).toISOString(),
      relativeTime: '42m ago',
    },
    {
      id: '5',
      type: 'procedure_edited',
      user: { username: 'nitish', initials: 'N' },
      procedure: { id: 'p2', name: 'analyze-codebase', slug: 'engineering/analyze-codebase' },
      editSummary: 'added "security-scan" node',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      relativeTime: '1h ago',
    },
  ];
}

function getMockQuickAccess(): QuickAccessItem[] {
  return [
    { id: 'p2', name: 'analyze-codebase', icon: '⚡', status: 'completed' as ExecutionStatus, meta: 'completed · 2m ago', progress: 100 },
    { id: 'p1', name: 'deploy-auth-flow', icon: '⚡', status: 'running' as ExecutionStatus, meta: 'running · 2/4 nodes', progress: 55 },
    { id: 'p5', name: 'onboard-user', icon: '🎯', status: 'completed' as ExecutionStatus, meta: 'completed · 3h ago', progress: 100 },
    { id: 'p4', name: 'security-review', icon: '⚡', status: 'waiting_input' as ExecutionStatus, meta: '⚠ awaiting approval', progress: 60 },
  ];
}

function getMockExecution(): ExecutionDetail {
  return {
    id: 'exec_clx8k2m',
    procedureId: 'p2',
    procedureName: 'analyze-codebase',
    procedureSlug: 'procedures/engineering/analyze-codebase',
    procedureDescription:
      'Analyzes repository structure, determines authentication strategy, and runs security scanning. Outputs a structured report with actionable recommendations.',
    status: 'completed',
    nodes: [
      { id: 'n1', label: 'Analyze Repository Structure', type: 'llm_generate', status: 'completed', duration: '1.8s', tokens: 1204 },
      { id: 'n2', label: 'Determine Auth Strategy', type: 'interpolative → "jwt-based"', status: 'completed', duration: '0.9s', tokens: 847 },
      { id: 'n3', label: 'Run Security Scanner', type: 'tool_call → security-scan', status: 'completed', duration: '1.5s', tokens: 796 },
    ],
    stats: { duration: '4.2s', tokens: 2847, nodesCompleted: 3, nodesTotal: 3 },
    startedAt: new Date(Date.now() - 300000).toISOString(),
    completedAt: new Date(Date.now() - 120000).toISOString(),
  };
}

function getMockAgentMessages(): AgentMessage[] {
  return [
    {
      id: 'm1',
      role: 'agent',
      timestamp: '12:04:22',
      content: 'Starting <code>analyze-codebase</code><br>Workspace: default · Timeout: 600s',
    },
    {
      id: 'm2',
      role: 'agent',
      timestamp: '12:04:22',
      content:
        '<span style="color:var(--accent)">▸</span> node/analyze <span style="color:var(--text-4)">llm_generate</span><br><span style="color:var(--text-4)">  "Analyze the repository at {{repo_path}}..."</span><br><span style="color:var(--green)">✓</span> 1.8s · 1,204 tk<br><span style="color:var(--text-4)">  → { language: "typescript", auth: "jwt" }</span>',
    },
    {
      id: 'm3',
      role: 'agent',
      timestamp: '12:04:24',
      content:
        '<span style="color:var(--accent)">▸</span> node/decide <span style="color:var(--text-4)">interpolative</span><br><span style="color:var(--green)">✓</span> chose <code>jwt-based</code> <span style="color:var(--text-4)">(0.92)</span><br><span style="color:var(--text-4)">  "Existing JWT manager found"</span>',
    },
    {
      id: 'm4',
      role: 'agent',
      timestamp: '12:04:25',
      content:
        '<span style="color:var(--accent)">▸</span> node/execute <span style="color:var(--text-4)">tool_call</span><br><span style="color:var(--green)">✓</span> 1.5s · 0 critical, 2 warnings',
    },
    {
      id: 'm5',
      role: 'agent',
      timestamp: '12:04:27',
      content: '<span style="color:var(--green)">✓</span> <strong>Done</strong> — 3/3 · 2,847 tk · 4.2s',
    },
  ];
}

export default function Home() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const omnibox = useOmnibox();

  // Space state
  const [activeSpace, setActiveSpace] = useState<Space>('home');

  // Data state
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [quickAccess, setQuickAccess] = useState<QuickAccessItem[]>([]);
  const [procedures, setProcedures] = useState<TreeNode[]>([]);
  const [files, setFiles] = useState<ProcedureFile[]>([]);
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [storeApps, setStoreApps] = useState<StoreApp[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [trustGateEvent, setTrustGateEvent] = useState<TrustGateEvent | null>(null);

  // WebSocket
  const { sendTrustGateResponse } = useWebSocket({
    onTrustGate: (event) => setTrustGateEvent(event),
    onActivity: (post) => setPosts((prev) => [post, ...prev]),
    onExecutionUpdate: () => {
      // Refresh execution detail if currently viewing
    },
  });

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load data on mount
  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadData() {
      // Try to load from API, fall back to mock data
      const [activityPosts, tree, apps] = await Promise.all([
        api.getActivity(),
        api.getProcedureTree().catch(() => [] as TreeNode[]),
        api.getStoreApps(),
      ]);

      // Use API data if available, otherwise mock
      setPosts(activityPosts.length > 0 ? activityPosts : getMockPosts());
      setProcedures(tree);
      setFiles(
        tree.length > 0
          ? flattenTreeToFiles(tree)
          : getMockFiles()
      );
      setQuickAccess(getMockQuickAccess());
      setStoreApps(apps);
      setExecution(getMockExecution());
      setAgentMessages(getMockAgentMessages());
    }

    loadData();
  }, [isAuthenticated]);

  const handleSpaceChange = useCallback((space: Space) => {
    setActiveSpace(space);
  }, []);

  const handleProcedureClick = useCallback(
    (id: string) => {
      // Navigate to editor with this procedure
      setActiveSpace('editor');
      // Load execution detail for this procedure
      api.getExecutionDetail(id).then((detail) => {
        if (detail) setExecution(detail);
      });
    },
    []
  );

  const handleTrustGateApprove = useCallback(
    (executionId: string, nodeId: string) => {
      sendTrustGateResponse(executionId, nodeId, true);
      setTrustGateEvent(null);
    },
    [sendTrustGateResponse]
  );

  const handleTrustGateAbort = useCallback(
    (executionId: string, nodeId: string) => {
      sendTrustGateResponse(executionId, nodeId, false);
      setTrustGateEvent(null);
    },
    [sendTrustGateResponse]
  );

  const handleOmniboxSelect = useCallback(
    (id: string) => {
      handleProcedureClick(id);
    },
    [handleProcedureClick]
  );

  const commandItems = flattenTree(procedures);
  const userName = user?.username || user?.email || '';
  const userInitials = userName.charAt(0).toUpperCase();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-0)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-4)] border-t-[var(--text-1)]" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const greeting = `${getGreeting()}, ${userName.split('@')[0]}`;
  const summary = `${posts.filter((p) => p.type === 'execution_run' || p.type === 'execution_completed').length} procedures ran today · ${posts.filter((p) => p.type === 'awaiting_approval').length} awaiting approval`;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-0)]">
      <NavRail
        activeSpace={activeSpace}
        onSpaceChange={handleSpaceChange}
        userInitials={userInitials}
        hasNotification={posts.some((p) => p.type === 'awaiting_approval')}
        onLogout={logout}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Home */}
        {activeSpace === 'home' && (
          <HomeSpace
            greeting={greeting}
            summary={summary}
            quickAccess={quickAccess}
            posts={posts}
            currentUser={userName}
            onSearch={omnibox.open}
            onQuickAccessClick={handleProcedureClick}
            onProcedureClick={handleProcedureClick}
            onApprove={handleTrustGateApprove}
            onAbort={handleTrustGateAbort}
          />
        )}

        {/* Browse */}
        {activeSpace === 'browse' && (
          <BrowseSpace
            files={files}
            currentPath="procedures / engineering"
            onFileOpen={handleProcedureClick}
          />
        )}

        {/* Editor */}
        {activeSpace === 'editor' && (
          <EditorSpace
            execution={execution}
            agentMessages={agentMessages}
            onRun={(id) => {
              api.executeProcedure(id).catch(() => {});
            }}
            onBrowseNavigate={() => setActiveSpace('browse')}
          />
        )}

        {/* Store */}
        {activeSpace === 'store' && (
          <StoreSpace apps={storeApps} />
        )}
      </div>

      {/* Command palette */}
      <Omnibox
        items={commandItems}
        onSelect={handleOmniboxSelect}
        onClose={omnibox.close}
        isOpen={omnibox.isOpen}
      />

      {/* Trust gate modal */}
      <TrustGateDialog
        event={trustGateEvent}
        onApprove={handleTrustGateApprove}
        onAbort={handleTrustGateAbort}
      />
    </div>
  );
}

function flattenTreeToFiles(nodes: TreeNode[]): ProcedureFile[] {
  const result: ProcedureFile[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name,
      slug: node.slug || node.name,
      type: node.type,
      isFolder: node.type === 'folder',
    });
    if (node.children) {
      result.push(...flattenTreeToFiles(node.children));
    }
  }
  return result;
}

function getMockFiles(): ProcedureFile[] {
  return [
    { id: 'p2', name: 'analyze-codebase', slug: 'analyze-codebase', type: 'skill' },
    { id: 'p1', name: 'deploy-auth-flow', slug: 'deploy-auth-flow', type: 'skill' },
    { id: 'p3', name: 'migrate-database', slug: 'migrate-database', type: 'skill' },
    { id: 'p5', name: 'onboard-user', slug: 'onboard-user', type: 'task' },
    { id: 'p6', name: 'team-setup-guide', slug: 'team-setup-guide', type: 'guide' },
    { id: 'p4', name: 'security-review', slug: 'security-review', type: 'skill' },
    { id: 'f1', name: 'onboarding', slug: 'onboarding', type: 'folder', isFolder: true },
    { id: 'f2', name: 'security', slug: 'security', type: 'folder', isFolder: true },
    { id: 'f3', name: 'templates', slug: 'templates', type: 'folder', isFolder: true },
  ];
}
