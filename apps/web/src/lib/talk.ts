import { create } from 'zustand';
import { db, type TalkRow } from './db';
import { useEditor } from '../store/editor';

/**
 * Team Talk (SPEC §10): voice recorded with MediaRecorder while the animation plays from the start,
 * stored locally per board and played back in sync with the timeline.
 */
type TalkState = { recording: boolean; talk: TalkRow | null; enabled: boolean };
export const useTalk = create<TalkState>()(() => ({ recording: false, talk: null, enabled: true }));

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

export async function loadTalk(boardId: string) {
  const talk = (await db.talks.get(boardId).catch(() => undefined)) ?? null;
  useTalk.setState({ talk });
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = talk ? URL.createObjectURL(talk.blob) : null;
  audio = audioUrl ? new Audio(audioUrl) : null;
}

export async function deleteTalk(boardId: string) {
  await db.talks.delete(boardId);
  await loadTalk(boardId);
}

export function talkSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function startRecording() {
  const s = useEditor.getState();
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  const boardId = s.board.id;
  const started = performance.now();
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    await db.talks.put({ boardId, blob, mime: blob.type, durationMs: Math.round(performance.now() - started), createdAt: new Date().toISOString() });
    recorder = null;
    useTalk.setState({ recording: false });
    await loadTalk(boardId);
  };
  audio?.pause();
  s.set({ speed: 1, loop: false });
  s.setPhase(0);
  recorder.start(250);
  useTalk.setState({ recording: true });
  useEditor.getState().play();
}

export function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  useEditor.getState().pause();
}

/** Keep the audio element in sync with the editor playback (call once). */
export function startTalkSync() {
  let wasPlaying = false;
  useEditor.subscribe((s) => {
    if (useTalk.getState().recording) {
      if (wasPlaying && !s.playing) stopRecording();
      wasPlaying = s.playing;
      return;
    }
    if (!audio || !useTalk.getState().enabled) return;
    if (s.playing && !wasPlaying) {
      audio.currentTime = s.t / 1000;
      audio.playbackRate = s.speed;
      void audio.play().catch(() => {});
    } else if (!s.playing && wasPlaying) audio.pause();
    else if (s.playing && Math.abs(audio.currentTime - s.t / 1000) > 0.35 && s.t < 50) audio.currentTime = 0;
    if (s.playing) audio.playbackRate = s.speed;
    wasPlaying = s.playing;
  });
  let lastBoard = '';
  useEditor.subscribe((s) => {
    if (s.board.id !== lastBoard) {
      lastBoard = s.board.id;
      void loadTalk(lastBoard);
    }
  });
}

export async function currentTalkBlob(): Promise<Blob | undefined> {
  return useTalk.getState().talk?.blob;
}
