'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface WorldBible {
  id: string;
  project_id: string;
  world_name: string | null;
  time_period: string | null;
  geography: string | null;
  power_system_name: string | null;
  power_system_ranks: string[];
  power_system_rules: string | null;
  absolute_rules: string[];
  forbidden_elements: string[];
  additional_settings: Record<string, string>;
  version: number;
}

export default function WorldBiblePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [worldBible, setWorldBible] = useState<WorldBible | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    world_name: '',
    time_period: '',
    geography: '',
    power_system_name: '',
    power_system_rules: '',
    power_system_ranks: '',
    absolute_rules: '',
    forbidden_elements: '',
  });

  // Load World Bible
  const loadWorldBible = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/world-bible`);

      // 404는 World Bible이 아직 없는 경우 - 정상 케이스
      if (res.status === 404) {
        console.log('World Bible이 아직 없음 - 빈 폼 표시');
        setWorldBible(null);
        setFormData({
          world_name: '',
          time_period: '',
          geography: '',
          power_system_name: '',
          power_system_rules: '',
          power_system_ranks: '',
          absolute_rules: '',
          forbidden_elements: '',
        });
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // 데이터가 없거나 worldBible이 null인 경우 처리
      if (!data || !data.worldBible) {
        console.log('World Bible 데이터가 비어있음');
        setWorldBible(null);
        return;
      }

      setWorldBible(data.worldBible);

      // Populate form (null-safe)
      const wb = data.worldBible;
      setFormData({
        world_name: wb?.world_name || '',
        time_period: wb?.time_period || '',
        geography: wb?.geography || '',
        power_system_name: wb?.power_system_name || '',
        power_system_rules: wb?.power_system_rules || '',
        power_system_ranks: Array.isArray(wb?.power_system_ranks)
          ? wb.power_system_ranks.join('\n')
          : '',
        absolute_rules: Array.isArray(wb?.absolute_rules)
          ? wb.absolute_rules.join('\n')
          : '',
        forbidden_elements: Array.isArray(wb?.forbidden_elements)
          ? wb.forbidden_elements.join('\n')
          : '',
      });
    } catch (e) {
      console.error('World Bible 로드 에러:', e);
      // 에러가 발생해도 빈 폼을 표시하여 사용자가 새로 작성할 수 있게 함
      setWorldBible(null);
      setFormData({
        world_name: '',
        time_period: '',
        geography: '',
        power_system_name: '',
        power_system_rules: '',
        power_system_ranks: '',
        absolute_rules: '',
        forbidden_elements: '',
      });
      // 에러 메시지는 표시하되 치명적이지 않게
      setError('기존 World Bible을 불러오지 못했습니다. 새로 작성할 수 있습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadWorldBible();
  }, [loadWorldBible]);

  // Save World Bible (Create or Update)
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const payload = {
        world_name: formData.world_name || null,
        time_period: formData.time_period || null,
        geography: formData.geography || null,
        power_system_name: formData.power_system_name || null,
        power_system_rules: formData.power_system_rules || null,
        power_system_ranks: formData.power_system_ranks
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
        absolute_rules: formData.absolute_rules
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
        forbidden_elements: formData.forbidden_elements
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
      };

      // worldBible이 없으면 POST (생성), 있으면 PATCH (수정)
      const method = worldBible ? 'PATCH' : 'POST';
      const res = await fetch(`/api/projects/${projectId}/world-bible`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `저장 실패 (${res.status})`);
      }

      const data = await res.json();
      setWorldBible(data.worldBible);
      setSuccessMessage('저장되었습니다!');

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      console.error('World Bible 저장 에러:', e);
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">World Bible</h1>
            {worldBible && (
              <span className="text-sm text-gray-500">v{worldBible.version}</span>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              saving
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="max-w-5xl mx-auto px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}
      {successMessage && (
        <div className="max-w-5xl mx-auto px-6 py-2">
          <div className="bg-green-900/50 border border-green-700 rounded-lg px-4 py-2 text-green-300">
            {successMessage}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* 기본 정보 */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-400">기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">세계관 이름</label>
                <input
                  type="text"
                  name="world_name"
                  value={formData.world_name}
                  onChange={handleInputChange}
                  placeholder="예: 검황전설의 세계"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">시대/배경</label>
                <input
                  type="text"
                  name="time_period"
                  value={formData.time_period}
                  onChange={handleInputChange}
                  placeholder="예: 가상의 고대 중국 무협 세계"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-1">지리/지형</label>
              <textarea
                name="geography"
                value={formData.geography}
                onChange={handleInputChange}
                placeholder="세계의 지리적 특징, 주요 지역, 국가 등을 기술하세요..."
                rows={4}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </section>

          {/* 힘의 체계 */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 text-purple-400">힘의 체계</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">체계 이름</label>
                <input
                  type="text"
                  name="power_system_name"
                  value={formData.power_system_name}
                  onChange={handleInputChange}
                  placeholder="예: 내공/무공 체계"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">등급/서열 (한 줄에 하나씩)</label>
                <textarea
                  name="power_system_ranks"
                  value={formData.power_system_ranks}
                  onChange={handleInputChange}
                  placeholder="1. 무명소졸&#10;2. 삼류&#10;3. 이류&#10;4. 일류&#10;5. 초일류/절대고수"
                  rows={5}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-1">힘의 규칙/제한</label>
              <textarea
                name="power_system_rules"
                value={formData.power_system_rules}
                onChange={handleInputChange}
                placeholder="이 세계에서 힘이 어떻게 작동하는지, 제한은 무엇인지 기술하세요..."
                rows={4}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </section>

          {/* 절대 규칙 & 금기 */}
          <section className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 text-red-400">절대 규칙 & 금기</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  절대 규칙 (한 줄에 하나씩)
                </label>
                <textarea
                  name="absolute_rules"
                  value={formData.absolute_rules}
                  onChange={handleInputChange}
                  placeholder="이 세계에서 절대 어길 수 없는 규칙들...&#10;예: 화산파는 절대 사파와 손잡지 않는다&#10;예: 천마는 절대 중원에 나타나지 않는다"
                  rows={6}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  금기 요소 (한 줄에 하나씩)
                </label>
                <textarea
                  name="forbidden_elements"
                  value={formData.forbidden_elements}
                  onChange={handleInputChange}
                  placeholder="이야기에 절대 등장하면 안 되는 것들...&#10;예: 현대 기술 (총기, 전기)&#10;예: 외계인, SF 요소&#10;예: 이세계 전이"
                  rows={6}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* 저장 버튼 (하단) */}
          <div className="flex justify-end gap-4">
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-3 rounded-lg font-medium transition ${
                saving
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
