'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FileText,
  Activity,
  Wrench,
  HeartPulse,
  LogOut,
  LayoutDashboard,
} from 'lucide-react';
import { clearAuth, getUser } from '@/lib/auth';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/procedures', label: 'Procedures', icon: FileText },
  { href: '/executions', label: 'Executions', icon: Activity },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/health', label: 'DB Health', icon: HeartPulse },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = getUser();

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">kloudi.os ops</span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        {user && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground truncate max-w-[140px]">{user.email}</span>
            <button
              onClick={() => { clearAuth(); window.location.href = '/'; }}
              className="text-muted-foreground hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
