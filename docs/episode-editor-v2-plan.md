# Episode Editor V2 Plan

## Goal

Rebuild the episode editor around the writing flow instead of feature tabs while keeping:

- current APIs
- current project data model
- current episode editor page

V2 will be introduced as a new route and enabled via feature flag.

## Layout

Three-column workspace:

1. Left: Story Context
2. Center: Writing Workspace
3. Right: Episode Context and Validation

## Left Column

Low-emphasis reference drawer for:

- world bible
- characters
- story bible
- timeline
- unresolved hooks

Default state: collapsed rail with expandable drawer cards.

## Center Column

Main writing flow:

1. Episode Goal
2. Story State Snapshot
3. Main Editor
4. Control Bar

## Right Column

Focused episode-only decision support:

- validation result
- fix suggestions
- run metadata

## Reused logic

Reuse current editor logic for:

- episode loading
- context loading
- SSE generation
- quick validation
- partial rewrite
- save
- adopt / republish

## New route

Create:

- `src/app/(studio)/projects/[projectId]/episodes/[episodeId]/editor-v2/page.tsx`

Main implementation will live in:

- `src/components/editor/EpisodeEditorV2.tsx`

## Feature flag

Use:

- `NEXT_PUBLIC_EPISODE_EDITOR_V2`

Routing behavior:

- when enabled, episode list opens V2 route
- when disabled, episode list opens legacy route

## Scope for first implementation

- strong workspace layout
- clear writing flow labels
- context drawer
- episode goal + state snapshot cards
- editor + partial rewrite
- validation + metadata panel
- no API changes

## Out of scope for first implementation

- removing the legacy page
- changing DB schema
- changing generation pipeline behavior
