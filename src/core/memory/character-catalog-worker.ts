import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  convertToDbFormat,
  extractCharactersFromEpisode,
} from '@/core/memory/character-extractor';
import type { Database } from '@/types/database';

interface SyncCharacterCatalogInput {
  projectId: string;
  episodeId: string;
  episodeNumber: number;
  content: string;
  supabaseClient?: SupabaseClient<Database>;
}

interface SyncCharacterCatalogResult {
  inserted: number;
  skipped: number;
  updatedMentions: number;
}

function isNameMatch(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  if (left.length >= 2 && right.length >= 2) {
    return left.slice(-2) === right.slice(-2);
  }
  return false;
}

export async function syncCharacterCatalogFromEpisode(
  input: SyncCharacterCatalogInput
): Promise<SyncCharacterCatalogResult> {
  const { projectId, episodeId, episodeNumber, content, supabaseClient } = input;
  const supabase =
    supabaseClient ??
    (() => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new Error('Supabase service role is not configured.');
      }

      return createClient<Database>(url, key);
    })();

  if (!content.trim()) {
    return { inserted: 0, skipped: 0, updatedMentions: 0 };
  }

  const { data: existingChars, error: existingError } = await supabase
    .from('characters')
    .select('id, name, role')
    .eq('project_id', projectId);

  if (existingError) throw existingError;

  const list = existingChars || [];
  const protagonist = list.find((row) => row.role === 'protagonist')?.name || '주인공';
  const existingNames = list.map((row) => row.name);
  const extracted = await extractCharactersFromEpisode(
    content,
    episodeNumber,
    existingNames,
    protagonist,
    false
  );

  let inserted = 0;
  let skipped = 0;

  for (const char of extracted.newCharacters) {
    if (!char.name?.trim() || char.confidence < 0.5) {
      skipped += 1;
      continue;
    }

    const matched = list.find((row) => isNameMatch(char.name, row.name));
    if (matched) {
      skipped += 1;
      continue;
    }

    const payload = convertToDbFormat(char, projectId, episodeId, episodeNumber);
    const { error } = await supabase.from('characters').insert(payload);
    if (error) {
      skipped += 1;
    } else {
      inserted += 1;
      list.push({
        id: `inserted:${char.name}`,
        name: char.name,
        role: payload.role,
      });
    }
  }

  let updatedMentions = 0;
  for (const mention of extracted.existingCharacterMentions) {
    const matched = list.find((row) => isNameMatch(mention.name, row.name));
    if (!matched) continue;
    const { error } = await supabase
      .from('characters')
      .update({ last_appearance_episode: episodeNumber })
      .eq('id', matched.id);

    if (!error) updatedMentions += 1;
  }

  return { inserted, skipped, updatedMentions };
}
