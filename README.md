This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 2026-04-10 운영 이슈 대응 로그

### 증상
- `GET /api/projects/{projectId}/auto-writing` 에서 `404`, `500` 혼재
- `GET /api/projects/{projectId}/transition-contracts?sourceEpisodeNumber=1` 에서 `500`

### 원인 분석
- `auto-writing`:
  - 프로젝트 조회 에러를 모두 `404 Project not found`로 처리하고 있어 실제 원인 식별이 어려웠음
  - 프로덕션 DB 스키마에서 `projects.generation_config` 컬럼 미존재(`42703`) 확인
- `transition-contracts`:
  - 복구 가능한 스키마/컬럼 미존재 케이스도 `500`으로 처리됨

### 코드 수정
- [`src/app/api/projects/[projectId]/auto-writing/route.ts`](src/app/api/projects/[projectId]/auto-writing/route.ts)
  - `PGRST116`만 404 처리
  - 그 외 에러는 `details/code` 포함 500 반환
  - `generation_config` 컬럼 미존재(`42703`) 시 안전 fallback(`200`) 반환:
    - `autoWriting` 기본값
    - `unsupported: true`
    - `reason: "generation_config_column_missing"`
- [`src/app/api/projects/[projectId]/transition-contracts/route.ts`](src/app/api/projects/[projectId]/transition-contracts/route.ts)
  - `42P01`, `42703`, relation/column 미존재 패턴을 복구 가능한 스키마 에러로 처리
  - GET에서는 `contract: null` 반환으로 UI 연속 동작 보장

### 배포
- Production Alias: `https://webnovel-studio.vercel.app`
- Inspect:
  - `https://vercel.com/yccom/webnovel-studio/BwPz57JsvKh3ZY4NfiWwZK1T1TgM`
  - `https://vercel.com/yccom/webnovel-studio/DpgqRdYKKmto6uFfE7q4qq5TtYhS`

### 검증 결과
- `auto-writing`:
  - 이전: `500`
  - 현재: `200` + fallback payload (`unsupported: true`)
- `transition-contracts`:
  - 비로그인 호출 기준 `401 Authentication required` 정상 응답 (서버 `500` 미재현)

### 남은 작업(권장)
- 프로덕션 DB에 `supabase/migrations/00010_hybrid_generation.sql` 적용
  - 핵심: `projects.generation_config` 컬럼 추가
  - 적용 후 `auto-writing` fallback 해제 및 PATCH/POST 정상 동작 확인 필요
