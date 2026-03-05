'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  title: string;
  genre: string | null;
  status: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  shortLabel?: string;
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
      }
    } catch {
      // Ignore errors
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const navItems: NavItem[] = [
    { href: `/projects/${projectId}`, label: '대시보드', icon: '🏠', shortLabel: '홈' },
    { href: `/projects/${projectId}/episodes`, label: '에피소드', icon: '📝', shortLabel: '에피' },
    { href: `/projects/${projectId}/world-bible`, label: '세계관', icon: '🌍', shortLabel: '세계' },
    { href: `/projects/${projectId}/characters`, label: '캐릭터', icon: '👥', shortLabel: '캐릭' },
    { href: `/projects/${projectId}/timeline`, label: '타임라인', icon: '📊', shortLabel: '타임' },
    { href: `/projects/${projectId}/writing-memory`, label: 'Writing Memory', icon: '🧠', shortLabel: 'WM' },
    { href: `/projects/${projectId}/quality`, label: '퀄리티 검증', icon: '✅', shortLabel: '검증' },
    { href: `/projects/${projectId}/export`, label: '내보내기', icon: '📤', shortLabel: '출력' },
  ];

  const isActive = (href: string) => {
    if (href === `/projects/${projectId}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-56'
        } bg-gray-950 border-r border-gray-800 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Project Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <Link
                  href="/projects"
                  className="text-xs text-gray-500 hover:text-gray-300 transition flex items-center gap-1"
                >
                  <span>←</span>
                  <span>프로젝트 목록</span>
                </Link>
                <h1 className="text-sm font-bold text-white mt-1 truncate">
                  {project?.title || '로딩 중...'}
                </h1>
                {project?.genre && (
                  <span className="text-xs text-gray-500">{project.genre}</span>
                )}
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-gray-800 rounded transition text-gray-400 hover:text-white"
              title={sidebarCollapsed ? '사이드바 확장' : '사이드바 축소'}
            >
              {sidebarCollapsed ? '→' : '←'}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition ${
                isActive(item.href)
                  ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="text-lg">{item.icon}</span>
              {!sidebarCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          {!sidebarCollapsed ? (
            <div className="text-xs text-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Memory Pipeline Active</span>
              </div>
              <div className="text-gray-700">v1.0.0</div>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 bg-green-500 rounded-full" title="Memory Pipeline Active"></span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
