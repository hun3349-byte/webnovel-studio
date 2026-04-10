import type { GenerationMode, ModelRoute } from '@/types/generation';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export interface ResolveModelRouteOptions {
  requestedMode?: GenerationMode;
}

export function resolveModelRoute(
  options: ResolveModelRouteOptions = {}
): ModelRoute {
  const requestedMode = options.requestedMode || 'claude_legacy';
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (!hasAnthropic) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  if (requestedMode !== 'claude_legacy') {
    return createLegacyRoute(
      requestedMode,
      'Hybrid planner/punch-up architecture is retired. Using Claude single-writer mode.'
    );
  }

  return createLegacyRoute(requestedMode, undefined);
}

function createLegacyRoute(
  requestedMode: GenerationMode,
  fallbackReason?: string
): ModelRoute {
  return {
    requestedMode,
    resolvedMode: 'claude_legacy',
    plannerModel: null,
    proseModel: process.env.ANTHROPIC_PROSE_MODEL || DEFAULT_CLAUDE_MODEL,
    punchupModel: null,
    plannerProvider: null,
    proseProvider: 'anthropic',
    punchupProvider: null,
    fallbackReason,
  };
}
