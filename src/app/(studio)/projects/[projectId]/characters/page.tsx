'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra' | null;
  age: string | null;
  gender: string | null;
  appearance: string | null;
  personality: string | null;
  speech_pattern: string | null;
  backstory: string | null;
  goals: string[];
  is_alive: boolean;
  current_location: string | null;
  emotional_state: string | null;
  possessed_items: string[];
  injuries: string[];
  additional_data: Record<string, unknown>;
}

interface CharacterMemory {
  id: string;
  memory_type: string;
  summary: string;
  importance: number;
}

const ROLE_LABELS: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '악역',
  supporting: '조연',
  extra: '단역',
};

const ROLE_COLORS: Record<string, string> = {
  protagonist: 'bg-blue-600',
  antagonist: 'bg-red-600',
  supporting: 'bg-green-600',
  extra: 'bg-gray-600',
};

// Tier 시스템 상수
const TIER_LABELS: Record<number, string> = {
  1: '서브 주인공',
  2: '주요 조연',
  3: '엑스트라',
};

const TIER_COLORS: Record<number, string> = {
  1: 'bg-yellow-600 text-yellow-100',
  2: 'bg-purple-600 text-purple-100',
  3: 'bg-gray-600 text-gray-300',
};

const TIER_DESCRIPTIONS: Record<number, string> = {
  1: '메인 플롯에 깊이 개입하는 핵심 인물',
  2: '서브플롯을 이끄는 중요 인물',
  3: '배경 인물 (독자 반응 시 격상 가능)',
};

export default function CharactersPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterMemories, setCharacterMemories] = useState<CharacterMemory[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: '' as Character['role'] | '',
    age: '',
    gender: '',
    appearance: '',
    personality: '',
    speech_pattern: '',
    backstory: '',
    goals: '',
  });

  // Tier 복구 관련 상태
  const [fixingTiers, setFixingTiers] = useState(false);
  const [fixResult, setFixResult] = useState<{ fixed: string[]; message: string } | null>(null);

  // Load characters
  const loadCharacters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/characters`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setCharacters(data.characters);
    } catch {
      setError('캐릭터 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  // Open modal for new character
  const handleNewCharacter = () => {
    setEditingCharacter(null);
    setCharacterMemories([]);
    setFormData({
      name: '',
      role: '',
      age: '',
      gender: '',
      appearance: '',
      personality: '',
      speech_pattern: '',
      backstory: '',
      goals: '',
    });
    setShowModal(true);
  };

  // Open modal for editing
  const handleEditCharacter = async (character: Character) => {
    setEditingCharacter(character);
    setFormData({
      name: character.name,
      role: character.role || '',
      age: character.age || '',
      gender: character.gender || '',
      appearance: character.appearance || '',
      personality: character.personality || '',
      speech_pattern: character.speech_pattern || '',
      backstory: character.backstory || '',
      goals: character.goals?.join('\n') || '',
    });

    // Load character memories (traits, trauma etc)
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/${character.id}`);
      if (res.ok) {
        const data = await res.json();
        setCharacterMemories(data.memories || []);
      }
    } catch {
      // Ignore errors
    }

    setShowModal(true);
  };

  // Save character
  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: formData.name,
        role: formData.role || null,
        age: formData.age || null,
        gender: formData.gender || null,
        appearance: formData.appearance || null,
        personality: formData.personality || null,
        speech_pattern: formData.speech_pattern || null,
        backstory: formData.backstory || null,
        goals: formData.goals.split('\n').map(s => s.trim()).filter(Boolean),
      };

      let res;
      if (editingCharacter) {
        res = await fetch(
          `/api/projects/${projectId}/characters/${editingCharacter.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      } else {
        res = await fetch(`/api/projects/${projectId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error('Failed to save');

      setShowModal(false);
      loadCharacters();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // Delete character
  const handleDelete = async (character: Character) => {
    if (!confirm(`"${character.name}" 캐릭터를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${character.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete');

      loadCharacters();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
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
            <h1 className="text-xl font-bold">캐릭터 관리</h1>
            <span className="text-sm text-gray-500">{characters.length}명</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Tier 복구 버튼 (주인공/빌런이 엑스트라로 강등된 경우 복구) */}
            <button
              onClick={async () => {
                if (!confirm('주인공/빌런의 Tier를 복구하시겠습니까?\n(protagonist → Tier 1, antagonist → Tier 1)')) return;
                try {
                  setFixingTiers(true);
                  const res = await fetch(`/api/projects/${projectId}/characters/fix-tiers`, {
                    method: 'POST',
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setFixResult({ fixed: data.fixed, message: data.message });
                    loadCharacters();
                    setTimeout(() => setFixResult(null), 5000);
                  } else {
                    alert(`복구 실패: ${data.error}`);
                  }
                } catch {
                  alert('Tier 복구 중 오류가 발생했습니다.');
                } finally {
                  setFixingTiers(false);
                }
              }}
              disabled={fixingTiers}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition flex items-center gap-2"
              title="주인공/빌런이 엑스트라(Tier 3)로 강등된 경우 복구합니다"
            >
              {fixingTiers ? '복구 중...' : '🛡️ Tier 복구'}
            </button>

            <button
              onClick={handleNewCharacter}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              + 새 캐릭터
            </button>
          </div>
        </div>
      </div>

      {/* Tier 복구 결과 표시 */}
      {fixResult && (
        <div className="max-w-6xl mx-auto px-6 py-2">
          <div className="bg-green-900/50 border border-green-700 rounded-lg px-4 py-3">
            <div className="text-green-300 font-medium">{fixResult.message}</div>
            {fixResult.fixed.length > 0 && (
              <ul className="mt-2 text-sm text-green-400">
                {fixResult.fixed.map((item, i) => (
                  <li key={i}>✅ {item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-6xl mx-auto px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}

      {/* Character List */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {characters.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">👤</div>
            <h2 className="text-xl font-semibold mb-2">아직 캐릭터가 없습니다</h2>
            <p className="text-gray-400 mb-6">새 캐릭터를 추가해서 시작하세요</p>
            <button
              onClick={handleNewCharacter}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              + 첫 캐릭터 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map(character => {
              const tier = (character.additional_data?.tier as number) || 3;
              const isAutoExtracted = Boolean(character.additional_data?.is_auto_extracted);
              const confidence = character.additional_data?.extraction_confidence;

              return (
              <div
                key={character.id}
                className={`bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition cursor-pointer ${
                  isAutoExtracted ? 'border-l-4 border-yellow-500' : ''
                }`}
                onClick={() => handleEditCharacter(character)}
              >
                {/* 자동 추출 표시 */}
                {isAutoExtracted && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-yellow-400">
                    <span>🤖</span>
                    <span>AI 자동 추출</span>
                    {typeof confidence === 'number' && (
                      <span className="text-gray-500">
                        (신뢰도 {Math.round(confidence * 100)}%)
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      {character.name}
                      {!character.is_alive && (
                        <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">사망</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {character.role && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            ROLE_COLORS[character.role] || 'bg-gray-600'
                          }`}
                        >
                          {ROLE_LABELS[character.role] || character.role}
                        </span>
                      )}
                      {/* Tier 뱃지 */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${TIER_COLORS[tier]}`}
                        title={TIER_DESCRIPTIONS[tier]}
                      >
                        Tier {tier}: {TIER_LABELS[tier]}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(character);
                    }}
                    className="text-gray-500 hover:text-red-400 transition"
                  >
                    삭제
                  </button>
                </div>

                {character.personality && (
                  <p className="text-sm text-gray-400 mb-2 line-clamp-2">
                    {character.personality}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 text-xs">
                  {character.age && (
                    <span className="bg-gray-700 px-2 py-1 rounded">{character.age}</span>
                  )}
                  {character.gender && (
                    <span className="bg-gray-700 px-2 py-1 rounded">{character.gender}</span>
                  )}
                  {character.current_location && (
                    <span className="bg-gray-700 px-2 py-1 rounded">
                      📍 {character.current_location}
                    </span>
                  )}
                </div>

                {character.injuries && character.injuries.length > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    부상: {character.injuries.join(', ')}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold">
                {editingCharacter ? '캐릭터 편집' : '새 캐릭터'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">이름 *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="캐릭터 이름"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">역할</label>
                  <select
                    name="role"
                    value={formData.role || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">선택...</option>
                    <option value="protagonist">주인공</option>
                    <option value="antagonist">악역</option>
                    <option value="supporting">조연</option>
                    <option value="extra">단역</option>
                  </select>
                </div>
              </div>

              {/* Tier 업그레이드 섹션 (기존 캐릭터 편집 시에만 표시) */}
              {editingCharacter && (
                <div className="bg-gradient-to-r from-purple-900/30 to-yellow-900/30 border border-purple-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                    <span>⭐</span>
                    캐릭터 등급 (Tier) 설정
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">
                    등급이 높을수록 AI가 해당 인물을 메인 플롯에 깊이 개입시킵니다.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(tier => {
                      const currentTier = (editingCharacter.additional_data?.tier as number) || 3;
                      const isSelected = currentTier === tier;
                      return (
                        <button
                          key={tier}
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const res = await fetch(
                                `/api/projects/${projectId}/characters/${editingCharacter.id}/upgrade`,
                                {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tier }),
                                }
                              );
                              if (res.ok) {
                                loadCharacters();
                                // 현재 편집 중인 캐릭터 정보 업데이트
                                const updatedChar = { ...editingCharacter };
                                updatedChar.additional_data = {
                                  ...(updatedChar.additional_data || {}),
                                  tier,
                                };
                                setEditingCharacter(updatedChar);
                              } else {
                                alert('등급 변경에 실패했습니다.');
                              }
                            } catch {
                              alert('등급 변경 중 오류가 발생했습니다.');
                            }
                          }}
                          className={`p-3 rounded-lg text-left transition ${
                            isSelected
                              ? TIER_COLORS[tier] + ' ring-2 ring-white'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                        >
                          <div className="font-semibold text-sm">
                            Tier {tier}: {TIER_LABELS[tier]}
                          </div>
                          <div className="text-xs mt-1 opacity-80">
                            {TIER_DESCRIPTIONS[tier]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {Boolean(editingCharacter.additional_data?.is_auto_extracted) && (
                    <div className="mt-3 p-2 bg-yellow-900/30 rounded text-xs text-yellow-300 flex items-center gap-2">
                      <span>🤖</span>
                      <span>이 캐릭터는 AI가 자동 추출한 인물입니다. 독자 반응이 좋으면 등급을 올려주세요!</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">나이</label>
                  <input
                    type="text"
                    name="age"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="예: 20대 초반"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">성별</label>
                  <input
                    type="text"
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    placeholder="예: 남성"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">외모</label>
                <textarea
                  name="appearance"
                  value={formData.appearance}
                  onChange={handleInputChange}
                  placeholder="외모 묘사..."
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">성격</label>
                <textarea
                  name="personality"
                  value={formData.personality}
                  onChange={handleInputChange}
                  placeholder="성격 특성..."
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">말투/어투</label>
                <textarea
                  name="speech_pattern"
                  value={formData.speech_pattern}
                  onChange={handleInputChange}
                  placeholder="특징적인 말투나 자주 쓰는 표현..."
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">배경 스토리</label>
                <textarea
                  name="backstory"
                  value={formData.backstory}
                  onChange={handleInputChange}
                  placeholder="과거사, 트라우마, 중요 경험..."
                  rows={4}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">목표 (한 줄에 하나씩)</label>
                <textarea
                  name="goals"
                  value={formData.goals}
                  onChange={handleInputChange}
                  placeholder="캐릭터의 목표나 동기..."
                  rows={2}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>

              {/* Character Memories (시뮬레이션 결과) */}
              {characterMemories.length > 0 && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-purple-400 mb-2">
                    시뮬레이션 결과 (발현된 특성)
                  </h3>
                  <div className="space-y-2">
                    {characterMemories.map(memory => (
                      <div
                        key={memory.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            memory.memory_type === 'trauma'
                              ? 'bg-red-900 text-red-300'
                              : memory.memory_type === 'knowledge'
                              ? 'bg-blue-900 text-blue-300'
                              : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {memory.memory_type}
                        </span>
                        <span className="text-gray-300">{memory.summary}</span>
                        <span className="text-gray-500 text-xs">
                          (중요도 {memory.importance})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
              >
                취소
              </button>
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
        </div>
      )}
    </div>
  );
}
