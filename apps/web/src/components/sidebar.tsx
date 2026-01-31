'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, Zap, Target, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface TreeNode {
  id: string;
  name: string;
  type: 'guide' | 'skill' | 'task' | 'project' | 'folder';
  children?: TreeNode[];
}

interface SidebarProps {
  items: TreeNode[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const typeIcons = {
  guide: BookOpen,
  skill: Zap,
  task: Target,
  project: Folder,
  folder: Folder,
};

const typeColors = {
  guide: 'text-blue-400',
  skill: 'text-yellow-400',
  task: 'text-green-400',
  project: 'text-purple-400',
  folder: 'text-muted-foreground',
};

function TreeItem({
  node,
  depth = 0,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const Icon = typeIcons[node.type] || FileText;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
          onSelect(node.id);
        }}
        className={cn(
          'flex w-full items-center gap-1 rounded px-2 py-1.5 text-sm transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <span className="flex h-4 w-4 items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <Icon className={cn('h-4 w-4', typeColors[node.type])} />
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ items, selectedId, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-purple-600">
          <span className="text-xs font-bold text-white">L</span>
        </div>
        <span className="font-semibold text-foreground">lore.dev</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {items.map((item) => (
          <TreeItem
            key={item.id}
            node={item}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
