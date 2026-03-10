'use client';

import { useState, useEffect, useCallback } from 'react';

interface CharacterStatus {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra';
  is_alive: boolean;
  current_location?: string | null;
  emotional_state?: string | null;
  injuries?: string[] | null;
  possessed_items?: string[] | null;
  tier?: number;
}

interface CharacterStatusBoardProps {
  projectId: string;
  characters: CharacterStatus[];
  onCharacterUpdate?: (updatedCharacter: CharacterStatus) => void;
  compact?: boolean;
}

/**
 * 캐릭터 상태 보드 컴포넌트
 * - v8.4 CharacterStatusTracker 시스템과 연동
 * - 실시간 캐릭터 상태 표시
 * - 인라인 편집 기능 (위치, 감정 상태, 부상, 소지품)
 */
export function CharacterStatusBoard({
  projectId,
  characters,
  onCharacterUpdate,
  compact = false,
}: CharacterStatusBoardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CharacterStatus>>({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 역할별 색상
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'protagonist':
        return 'bg-yellow-500';
      case 'antagonist':
        return 'bg-red-500';
      case 'supporting':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  // 감정 상태 색상
  const getEmotionColor = (emotion?: string | null) => {
    if (!emotion) return 'bg-gray-600 text-gray-300';
    if (emotion.includes('분노') || emotion.includes('angry')) return 'bg-red-600/50 text-red-200';
    if (emotion.includes('슬픔') || emotion.includes('sad')) return 'bg-blue-600/50 text-blue-200';
    if (emotion.includes('기쁨') || emotion.includes('happy')) return 'bg-green-600/50 text-green-200';
    if (emotion.includes('긴장') || emotion.includes('nervous')) return 'bg-amber-600/50 text-amber-200';
    return 'bg-gray-600 text-gray-300';
  };

  // 편집 시작
  const startEdit = (character: CharacterStatus) => {
    setEditingId(character.id);
    setEditForm({
      current_location: character.current_location || '',
      emotional_state: character.emotional_state || '',
      injuries: character.injuries || [],
      possessed_items: character.possessed_items || [],
    });
  };

  // 편집 저장
  const saveEdit = async (characterId: string) => {
    if (!editForm) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_location: editForm.current_location || null,
          emotional_state: editForm.emotional_state || null,
          injuries: editForm.injuries?.length ? editForm.injuries : null,
          possessed_items: editForm.possessed_items?.length ? editForm.possessed_items : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onCharacterUpdate?.(data.character);
      }
    } catch (error) {
      console.error('Failed to update character:', error);
    } finally {
      setSaving(false);
      setEditingId(null);
      setEditForm({});
    }
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  // 배열 필드 업데이트 (injuries, possessed_items)
  const updateArrayField = (field: 'injuries' | 'possessed_items', value: string) => {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    setEditForm(prev => ({ ...prev, [field]: items }));
  };

  // 역할별 정렬 (protagonist > antagonist > supporting > extra)
  const sortedCharacters = [...characters].sort((a, b) => {
    const roleOrder = { protagonist: 0, antagonist: 1, supporting: 2, extra: 3 };
    return (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
  });

  if (compact) {
    // 컴팩트 모드: 간단한 목록만 표시
    return (
      <div className="space-y-2">
        {sortedCharacters.slice(0, 5).map((char) => (
          <div
            key={char.id}
            className={`flex items-center justify-between text-sm p-2 rounded ${
              !char.is_alive ? 'bg-red-900/20' : 'bg-gray-700/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${getRoleColor(char.role)}`} />
              <span className={!char.is_alive ? 'line-through text-gray-500' : 'text-gray-200'}>
                {char.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {char.current_location && (
                <span className="text-gray-500">{char.current_location}</span>
              )}
              <span className={`px-1.5 py-0.5 rounded ${getEmotionColor(char.emotional_state)}`}>
                {char.emotional_state || 'neutral'}
              </span>
            </div>
          </div>
        ))}
        {characters.length > 5 && (
          <p className="text-xs text-gray-500 text-center">
            +{characters.length - 5}명 더...
          </p>
        )}
      </div>
    );
  }

  // 풀 모드: 상세 정보 + 편집 기능
  return (
    <div className="space-y-3">
      {sortedCharacters.map((char) => {
        const isEditing = editingId === char.id;
        const isExpanded = expandedId === char.id;

        return (
          <div
            key={char.id}
            className={`rounded-lg border transition ${
              !char.is_alive
                ? 'bg-red-900/10 border-red-800/50'
                : isEditing
                ? 'bg-gray-700/50 border-blue-500'
                : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
            }`}
          >
            {/* 헤더 */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer"
              onClick={() => !isEditing && setExpandedId(isExpanded ? null : char.id)}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${getRoleColor(char.role)}`} />
                <span className={`font-medium ${!char.is_alive ? 'line-through text-gray-500' : 'text-white'}`}>
                  {char.name}
                </span>
                {char.tier && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    char.tier === 1 ? 'bg-yellow-500/20 text-yellow-300' :
                    char.tier === 2 ? 'bg-blue-500/20 text-blue-300' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    Tier {char.tier}
                  </span>
                )}
                {!char.is_alive && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-600/50 text-red-200">
                    사망
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${getEmotionColor(char.emotional_state)}`}>
                  {char.emotional_state || 'neutral'}
                </span>
                {!isEditing && (
                  <span className="text-gray-500 text-sm">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </div>
            </div>

            {/* 상세 정보 (확장 시) */}
            {isExpanded && !isEditing && (
              <div className="px-3 pb-3 border-t border-gray-700/50 pt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">위치:</span>{' '}
                    <span className="text-gray-300">{char.current_location || '미지정'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">상태:</span>{' '}
                    <span className="text-gray-300">{char.emotional_state || 'neutral'}</span>
                  </div>
                </div>

                {char.injuries && char.injuries.length > 0 && (
                  <div className="text-xs">
                    <span className="text-red-400">부상:</span>{' '}
                    <span className="text-gray-300">{char.injuries.join(', ')}</span>
                  </div>
                )}

                {char.possessed_items && char.possessed_items.length > 0 && (
                  <div className="text-xs">
                    <span className="text-amber-400">소지품:</span>{' '}
                    <span className="text-gray-300">{char.possessed_items.join(', ')}</span>
                  </div>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(char);
                  }}
                  className="text-xs px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded transition"
                >
                  상태 편집
                </button>
              </div>
            )}

            {/* 편집 모드 */}
            {isEditing && (
              <div className="px-3 pb-3 border-t border-gray-700/50 pt-2 space-y-3">
                {/* 위치 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">현재 위치</label>
                  <input
                    type="text"
                    value={editForm.current_location || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, current_location: e.target.value }))}
                    placeholder="예: 황궁, 무림맹 본당"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 감정 상태 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">감정 상태</label>
                  <input
                    type="text"
                    value={editForm.emotional_state || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, emotional_state: e.target.value }))}
                    placeholder="예: 긴장, 분노, 차분함"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 부상 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">부상 (쉼표로 구분)</label>
                  <input
                    type="text"
                    value={editForm.injuries?.join(', ') || ''}
                    onChange={(e) => updateArrayField('injuries', e.target.value)}
                    placeholder="예: 왼팔 골절, 내상"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 소지품 */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">소지품 (쉼표로 구분)</label>
                  <input
                    type="text"
                    value={editForm.possessed_items?.join(', ') || ''}
                    onChange={(e) => updateArrayField('possessed_items', e.target.value)}
                    placeholder="예: 청풍검, 해독단"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 버튼 */}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 text-gray-400 hover:text-white transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => saveEdit(char.id)}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {characters.length === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          등록된 캐릭터가 없습니다
        </div>
      )}
    </div>
  );
}

export default CharacterStatusBoard;
