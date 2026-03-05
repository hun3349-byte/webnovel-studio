'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  const loadUser = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  useEffect(() => {
    loadProject();
    loadUser();
  }, [loadProject, loadUser]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

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

        {/* User Info & Logout */}
        <div className="p-3 border-t border-gray-800">
          {!sidebarCollapsed ? (
            <div className="space-y-3">
              {/* User Email */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
                  {userEmail?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="text-gray-400 truncate flex-1" title={userEmail || ''}>
                  {userEmail || '로딩 중...'}
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition flex items-center justify-center gap-2"
              >
                {loggingOut ? '로그아웃 중...' : '로그아웃'}
              </button>

              {/* Status */}
              <div className="text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>Memory Pipeline Active</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium" title={userEmail || ''}>
                {userEmail?.charAt(0).toUpperCase() || '?'}
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                title="로그아웃"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
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
