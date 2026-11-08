import { create } from 'zustand';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { customAlphabet } from 'nanoid';
import { parseBoard, type Board } from '@diagonale/core';
import { db } from './db';

/**
 * Optional cloud backend (Supabase): auth, sync, short share links, Team Talk audio.
 * Enabled only when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time.
 */
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudEnabled = !!(URL_ && KEY);

let clientP: Promise<SupabaseClient> | null = null;
export function supabase(): Promise<SupabaseClient> {
  if (!cloudEnabled) return Promise.reject(new Error('Cloud not configured'));
  clientP ??= import('@supabase/supabase-js').then((m) =>
    m.createClient(URL_!, KEY!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }),
  );
  return clientP;
}

type AuthState = { user: User | null; ready: boolean };
export const useAuth = create<AuthState>()(() => ({ user: null, ready: !cloudEnabled }));

export async function initCloud(): Promise<void> {
  if (!cloudEnabled) return;
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  useAuth.setState({ user: data.session?.user ?? null, ready: true });
  sb.auth.onAuthStateChange((_e, session) => {
    const had = useAuth.getState().user;
    useAuth.setState({ user: session?.user ?? null });
    if (!had && session?.user) void pullAll();
  });
  // clean ?code= from the URL after the PKCE redirect
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  if (data.session?.user) void pullAll();
}

const redirectTo = () => `${location.origin}${location.pathname}`;

export async function signInWithEmail(email: string) {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  await (await supabase()).auth.signOut();
}

const uid = () => useAuth.getState().user?.id;

// ---------- sync ----------

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function debounce(key: string, fn: () => Promise<unknown>, ms = 1500) {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => void fn().catch((e) => console.warn('[cloud]', e)), ms),
  );
}

export function cloudSaveBoard(b: Board) {
  if (!cloudEnabled || !uid()) return;
  debounce(`board:${b.id}`, async () => {
    const sb = await supabase();
    await sb.from('boards').upsert({ id: b.id, owner: uid(), title: b.title, kind: b.kind, data: b, schema_version: b.schemaVersion, updated_at: b.updatedAt });
  });
}

export function cloudSaveRow(table: 'sessions' | 'teams' | 'sequences', id: string, data: unknown, extra: Record<string, unknown> = {}) {
  if (!cloudEnabled || !uid()) return;
  debounce(`${table}:${id}`, async () => {
    const sb = await supabase();
    await sb.from(table).upsert({ id, owner: uid(), data, ...extra });
  });
}

/** Pull remote boards (last write wins on updated_at). */
export async function pullAll(): Promise<number> {
  if (!cloudEnabled || !uid()) return 0;
  const sb = await supabase();
  const { data, error } = await sb.from('boards').select('id, data, updated_at');
  if (error) throw error;
  let n = 0;
  for (const row of data ?? []) {
    try {
      const remote = parseBoard(row.data);
      const local = await db.boards.get(remote.id);
      if (!local || local.updatedAt < remote.updatedAt) {
        await db.boards.put({ id: remote.id, title: remote.title, kind: remote.kind, updatedAt: remote.updatedAt, data: remote });
        n++;
      } else if (local.updatedAt > remote.updatedAt) cloudSaveBoard(local.data);
    } catch {
      /* skip invalid rows */
    }
  }
  // push local-only boards
  const remoteIds = new Set((data ?? []).map((r) => r.id as string));
  for (const local of await db.boards.toArray()) if (!remoteIds.has(local.id)) cloudSaveBoard(local.data);
  const sessions = await sb.from('sessions').select('id, data');
  for (const r of sessions.data ?? []) {
    const cur = await db.sessions.get(r.id);
    if (!cur) await db.sessions.put({ id: r.id, date: r.data.date, updatedAt: new Date().toISOString(), data: r.data });
  }
  const teams = await sb.from('teams').select('id, data');
  for (const r of teams.data ?? []) {
    const cur = await db.teamCentres.get(r.id);
    if (!cur) await db.teamCentres.put({ id: r.id, updatedAt: new Date().toISOString(), data: r.data });
  }
  return n;
}

export async function saveProfileLocale(locale: string) {
  if (!cloudEnabled || !uid()) return;
  const sb = await supabase();
  await sb.from('profiles').upsert({ id: uid(), locale });
}

// ---------- short share links (/d/:slug) ----------

const slugId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 10);
export const isSlug = (s: string) => /^[a-z0-9]{6,16}$/.test(s);

export async function createShortLink(board: Board, audio?: Blob): Promise<string> {
  const sb = await supabase();
  const owner = uid();
  if (!owner) throw new Error('Login required');
  const slug = slugId();
  let audio_path: string | null = null;
  if (audio) {
    audio_path = `${owner}/${slug}.${audio.type.includes('mp4') ? 'm4a' : 'webm'}`;
    const up = await sb.storage.from('talks').upload(audio_path, audio, { contentType: audio.type, upsert: false });
    if (up.error) throw up.error;
  }
  const { error } = await sb.from('shared_boards').insert({ slug, board_id: board.id, owner, snapshot: board, audio_path });
  if (error) throw error;
  return slug;
}

export async function fetchShared(slug: string): Promise<{ board: Board; audioUrl?: string }> {
  const sb = await supabase();
  const { data, error } = await sb.from('shared_boards').select('snapshot, audio_path').eq('slug', slug).single();
  if (error || !data) throw error ?? new Error('Not found');
  const board = parseBoard(data.snapshot);
  const audioUrl = data.audio_path ? sb.storage.from('talks').getPublicUrl(data.audio_path).data.publicUrl : undefined;
  return { board, audioUrl };
}
