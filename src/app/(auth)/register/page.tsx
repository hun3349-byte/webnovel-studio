'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      setLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/projects`,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다.');
        } else if (authError.message.includes('rate limit')) {
          setError('이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        } else {
          setError(authError.message);
        }
        return;
      }

      // 이메일 확인이 비활성화된 경우 바로 로그인됨
      router.push('/projects');
      return;
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-800">
        <div className="text-center">
          <div className="text-5xl mb-4">✉️</div>
          <h2 className="text-xl font-bold text-white mb-2">이메일을 확인해주세요</h2>
          <p className="text-gray-400 text-sm mb-6">
            <span className="text-blue-400">{email}</span>로 인증 링크를 발송했습니다.
            <br />
            이메일의 링크를 클릭하여 가입을 완료해주세요.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition"
          >
            로그인 페이지로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-800">
      {/* Logo/Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">회원가입</h1>
        <p className="text-gray-400 text-sm">Webnovel Studio 계정을 만드세요</p>
      </div>

      {/* Register Form */}
      <form onSubmit={handleRegister} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="최소 6자 이상"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
            비밀번호 확인
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="비밀번호를 다시 입력"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-lg font-semibold transition ${
            loading
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      {/* Login Link */}
      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
            로그인
          </Link>
        </p>
      </div>

      {/* Features */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        <p className="text-gray-500 text-xs text-center mb-4">가입하면 이용 가능한 기능</p>
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>AI 에피소드 생성</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>Memory Pipeline</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>퀄리티 자동 검증</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span>플랫폼 내보내기</span>
          </div>
        </div>
      </div>
    </div>
  );
}
