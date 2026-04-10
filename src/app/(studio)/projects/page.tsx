'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Project {
  id: string;
  title: string;
  genre: string | null;
  status: string;
  total_episodes: number;
  created_at: string;
  updated_at: string;
}

interface ImportPreview {
  hasWorldBible: boolean;
  characterCount: number;
  synopsisCount?: number;
  layers: string[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // 탭 및 JSON Import 상태
  const [activeTab, setActiveTab] = useState<'empty' | 'import'>('empty');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonData, setJsonData] = useState<Record<string, unknown> | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadUser = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadUser();
  }, [loadProjects, loadUser]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // JSON 파일 선택 핸들러
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setJsonFile(file);
    setImportError(null);
    setParsing(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setJsonData(data);

      // 서버에서 미리보기 정보 가져오기
      const previewRes = await fetch('/api/projects/import-create', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (previewRes.ok) {
        const preview = await previewRes.json();
        if (preview.suggestedTitle && !newTitle) {
          setNewTitle(preview.suggestedTitle);
        }
        if (preview.genre && !newGenre) {
          setNewGenre(preview.genre);
        }
        setImportPreview(preview.preview);
      }
    } catch {
      setImportError('JSON 파일을 파싱할 수 없습니다. 올바른 형식인지 확인해주세요.');
      setJsonFile(null);
      setJsonData(null);
    } finally {
      setParsing(false);
    }
  };

  // 빈 프로젝트 생성
  const handleCreateEmptyProject = async () => {
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
      closeModal();
      router.push(`/projects/${data.project.id}`);
    } catch {
      alert('프로젝트 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // JSON Import로 프로젝트 생성
  const handleCreateWithImport = async () => {
    if (!newTitle.trim()) {
      alert('프로젝트 제목을 입력해주세요.');
      return;
    }

    if (!jsonData) {
      alert('JSON 파일을 먼저 업로드해주세요.');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch('/api/projects/import-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          genre: newGenre || null,
          data: jsonData,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || '프로젝트 생성에 실패했습니다.');
      }

      // 성공 알림
      const summary = result.result;
      alert(
        `프로젝트 생성 완료!\n\n` +
        `- 세계관: ${summary.worldBible ? '가져옴' : '없음'}\n` +
        `- 캐릭터: ${summary.characters.length}명\n` +
        `- 떡밥: ${summary.storyHooks}개`
      );

      closeModal();
      router.push(result.redirectUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 모달 닫기 및 상태 초기화
  const closeModal = () => {
    setShowModal(false);
    setNewTitle('');
    setNewGenre('');
    setActiveTab('empty');
    setJsonFile(null);
    setJsonData(null);
    setImportPreview(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 생성 버튼 핸들러
  const handleCreateProject = async () => {
    if (activeTab === 'empty') {
      await handleCreateEmptyProject();
    } else {
      await handleCreateWithImport();
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
          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                {userEmail?.charAt(0).toUpperCase() || '?'}
              </div>
              <span className="text-gray-400 hidden sm:inline">{userEmail}</span>
            </div>
            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            >
              {loggingOut ? '...' : '로그아웃'}
            </button>
            {/* New Project */}
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              + 새 프로젝트
            </button>
          </div>
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
          <div className="bg-gray-800 rounded-lg w-full max-w-lg">
            {/* Header with Tabs */}
            <div className="border-b border-gray-700">
              <div className="p-4 pb-0">
                <h2 className="text-xl font-bold mb-4">새 프로젝트</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('empty')}
                    className={`px-4 py-2 rounded-t-lg font-medium transition ${
                      activeTab === 'empty'
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    빈 프로젝트
                  </button>
                  <button
                    onClick={() => setActiveTab('import')}
                    className={`px-4 py-2 rounded-t-lg font-medium transition flex items-center gap-2 ${
                      activeTab === 'import'
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    JSON 불러오기
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Import Tab: File Upload */}
              {activeTab === 'import' && (
                <div className="space-y-4">
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* File Drop Zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
                      jsonFile
                        ? 'border-green-500 bg-green-900/20'
                        : 'border-gray-600 hover:border-blue-500 hover:bg-gray-700/30'
                    }`}
                  >
                    {parsing ? (
                      <div className="flex items-center justify-center gap-2 text-gray-400">
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>파싱 중...</span>
                      </div>
                    ) : jsonFile ? (
                      <div>
                        <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="font-medium">{jsonFile.name}</span>
                        </div>
                        <p className="text-sm text-gray-400">클릭하여 다른 파일 선택</p>
                      </div>
                    ) : (
                      <div>
                        <svg className="mx-auto h-10 w-10 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-gray-300 mb-1">JSON 파일을 선택하세요</p>
                        <p className="text-xs text-gray-500">Narrative Simulator 데이터 지원</p>
                      </div>
                    )}
                  </div>

                  {/* Import Error */}
                  {importError && (
                    <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
                      {importError}
                    </div>
                  )}

                  {/* Preview Info */}
                  {importPreview && (
                    <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-400 mb-2">데이터 미리보기</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={importPreview.hasWorldBible ? 'text-green-400' : 'text-gray-500'}>
                            {importPreview.hasWorldBible ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-300">세계관 설정</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400">{importPreview.characterCount}</span>
                          <span className="text-violet-400 ml-4">{importPreview.synopsisCount ?? 0}</span>
                          <span className="text-gray-300">캐릭터</span>
                        </div>
                      </div>
                      {importPreview.layers.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {importPreview.layers.map(layer => (
                            <span key={layer} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                              {layer}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Common Fields */}
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
                  autoFocus={activeTab === 'empty'}
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

              {/* Import Mode Hint */}
              {activeTab === 'import' && !jsonFile && (
                <p className="text-xs text-gray-500">
                  JSON 파일을 업로드하면 세계관, 캐릭터, 떡밥이 자동으로 추가됩니다.
                </p>
              )}
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creating || !newTitle.trim() || (activeTab === 'import' && !jsonData)}
                className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                  creating || !newTitle.trim() || (activeTab === 'import' && !jsonData)
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : activeTab === 'import'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {creating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>생성 중...</span>
                  </>
                ) : activeTab === 'import' ? (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>데이터 불러와서 만들기</span>
                  </>
                ) : (
                  '만들기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
