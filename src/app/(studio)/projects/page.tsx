'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  title: string;
  genre: string | null;
  status: string;
  total_episodes: number;
  created_at: string;
  updated_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    if (!newTitle.trim()) {
      alert('프로젝트 제목을 입력해주세요.');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          genre: newGenre || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to create');

      const data = await res.json();
      setShowModal(false);
      setNewTitle('');
      setNewGenre('');

      // Navigate to the new project
      router.push(`/projects/${data.project.id}`);
    } catch {
      alert('프로젝트 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`"${project.title}" 프로젝트를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');

      loadProjects();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">내 프로젝트</h1>
            <p className="text-sm text-gray-400">{projects.length}개의 프로젝트</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            + 새 프로젝트
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-semibold mb-2">아직 프로젝트가 없습니다</h2>
            <p className="text-gray-400 mb-6">새 프로젝트를 만들어 웹소설 집필을 시작하세요</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              + 첫 프로젝트 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{project.title}</h3>
                  <button
                    onClick={e => {
                      e.preventDefault();
                      handleDeleteProject(project);
                    }}
                    className="text-gray-500 hover:text-red-400 transition text-sm"
                  >
                    삭제
                  </button>
                </div>
                {project.genre && (
                  <span className="inline-block px-2 py-1 bg-gray-700 rounded text-xs text-gray-300 mb-3">
                    {project.genre}
                  </span>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{project.total_episodes}화</span>
                  <span>
                    {new Date(project.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold">새 프로젝트</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  프로젝트 제목 *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="예: 검황전설"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">장르</label>
                <select
                  value={newGenre}
                  onChange={e => setNewGenre(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택...</option>
                  <option value="무협">무협</option>
                  <option value="판타지">판타지</option>
                  <option value="현대판타지">현대판타지</option>
                  <option value="로맨스">로맨스</option>
                  <option value="로맨스판타지">로맨스판타지</option>
                  <option value="SF">SF</option>
                  <option value="게임">게임</option>
                  <option value="스포츠">스포츠</option>
                  <option value="기타">기타</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setNewTitle('');
                  setNewGenre('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creating || !newTitle.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  creating || !newTitle.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
