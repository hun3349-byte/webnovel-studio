'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Project {
  id: string;
  title: string;
  genre: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const json = await res.json();
      setProject(json.project as Project);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const isActive = (href: string) =>
    href === `/projects/${projectId}` ? pathname === href : pathname.startsWith(href);

  const coreNav: NavItem[] = [
    { href: `/projects/${projectId}`, label: '작업 대시보드', icon: '🏠' },
    { href: `/projects/${projectId}/episodes`, label: '에피소드 작업대', icon: '✍️' },
    { href: `/projects/${projectId}/quality`, label: '검증 결과', icon: '✅' },
  ];

  const advancedNav: NavItem[] = [
    { href: `/projects/${projectId}/world-bible`, label: '세계관', icon: '🌍' },
    { href: `/projects/${projectId}/characters`, label: '캐릭터', icon: '🧑' },
    { href: `/projects/${projectId}/story-bible`, label: '스토리 바이블', icon: '📚' },
    { href: `/projects/${projectId}/timeline`, label: '타임라인', icon: '🧭' },
    { href: `/projects/${projectId}/writing-memory`, label: 'Writing Memory', icon: '🧠' },
    { href: `/projects/${projectId}/style-dna`, label: '문체 DNA', icon: '🧬' },
    { href: `/projects/${projectId}/export`, label: '내보내기', icon: '📦' },
  ];

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} border-r border-gray-800 bg-gray-950 flex flex-col transition-all`}>
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between gap-2">
            {!collapsed && (
              <div className="min-w-0">
                <Link href="/projects" className="text-xs text-gray-500 hover:text-gray-300">← 프로젝트 목록</Link>
                <div className="mt-1 truncate text-sm font-semibold">{project?.title || '프로젝트'}</div>
                {project?.genre && <div className="text-xs text-gray-500">{project.genre}</div>}
              </div>
            )}
            <button onClick={() => setCollapsed((v) => !v)} className="rounded p-1.5 hover:bg-gray-800 text-gray-400">
              {collapsed ? '→' : '←'}
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {coreNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                isActive(item.href)
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}

          {!collapsed && (
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-3 mb-2 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-left text-xs text-gray-400 hover:text-gray-200"
            >
              {showAdvanced ? '고급 메뉴 숨기기' : '고급 메뉴 보기'}
            </button>
          )}

          {(showAdvanced || collapsed) &&
            advancedNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive(item.href)
                    ? 'bg-gray-800 text-white border border-gray-700'
                    : 'text-gray-400 hover:bg-gray-900'
                }`}
              >
                <span>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <button onClick={handleLogout} className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800">
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
