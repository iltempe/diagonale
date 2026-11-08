import Konva from 'konva';
import { zipSync } from 'fflate';
import { evaluate, phaseFrame, serializeBoard, timeline, type Board } from '@diagonale/core';
import { BoardRenderer, preloadImages, type RenderOptions } from '@diagonale/render';
import i18n from '../i18n';
import { downloadBlob, slugify } from './persistence';

export type Orientation = 'horizontal' | 'vertical';

export type ExportCommon = {
  lang: string;
  /** vertical = 9:16 output, pitch rendered vertically */
  orientation: Orientation;
  showNames?: boolean;
  captions?: boolean;
};

export const RESOLUTIONS = { '720p': [1280, 720], '1080p': [1920, 1080] } as const;
export type Resolution = keyof typeof RESOLUTIONS;

function size(res: Resolution, orientation: Orientation): [number, number] {
  const [w, h] = RESOLUTIONS[res];
  return orientation === 'vertical' ? [h, w] : [w, h];
}

/** Create an offscreen renderer at an exact pixel size (pixelRatio 1). */
function offscreen(width: number, height: number): { r: BoardRenderer; dispose: () => void } {
  const prev = Konva.pixelRatio;
  Konva.pixelRatio = 1;
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  const r = new BoardRenderer(div, width, height);
  Konva.pixelRatio = prev;
  return {
    r,
    dispose: () => {
      r.destroy();
      div.remove();
    },
  };
}

export function phaseCaption(board: Board, i: number, lang: string): string {
  const t = i18n.getFixedT(lang, 'export');
  const label = board.phases[i]?.label;
  return `${t('phaseN', { n: i + 1, total: board.phases.length })}${label ? ` — ${label}` : ''}`;
}

function opts(c: ExportCommon, caption: string | null): RenderOptions {
  return {
    editable: false,
    showNames: c.showNames ?? true,
    showPhotos: true,
    orientation: c.orientation,
    caption: c.captions === false ? null : caption,
    watermark: 'Diagonale',
  };
}

function composite(r: BoardRenderer, ctx: CanvasRenderingContext2D, w: number, h: number) {
  r.drawNow();
  ctx.clearRect(0, 0, w, h);
  for (const layer of r.stage.getLayers()) ctx.drawImage(layer.getNativeCanvasElement(), 0, 0, w, h);
}

export async function renderPhasePng(board: Board, phase: number, c: ExportCommon & { resolution: Resolution }): Promise<Blob> {
  const [w, h] = size(c.resolution, c.orientation);
  await preloadImages(board);
  const { r, dispose } = offscreen(w, h);
  try {
    r.render(board, phaseFrame(board, phase), opts(c, phaseCaption(board, phase, c.lang)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    composite(r, canvas.getContext('2d')!, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    dispose();
  }
}

export async function exportPng(board: Board, phase: number, c: ExportCommon & { resolution: Resolution }) {
  const blob = await renderPhasePng(board, phase, c);
  downloadBlob(blob, `${slugify(board.title)}-${phase + 1}.png`);
}

export async function exportAllPngZip(board: Board, c: ExportCommon & { resolution: Resolution }) {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < board.phases.length; i++) {
    const blob = await renderPhasePng(board, i, c);
    files[`${String(i + 1).padStart(2, '0')}-${slugify(board.phases[i]!.label ?? '') || 'phase'}.png`] = new Uint8Array(await blob.arrayBuffer());
  }
  const zip = zipSync(files, { level: 0 });
  downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${slugify(board.title)}.zip`);
}

export function exportJson(board: Board) {
  downloadBlob(new Blob([serializeBoard(board)], { type: 'application/json' }), `${slugify(board.title)}.diagonale.json`);
}

/** WinAnsi-safe text for the standard PDF fonts. */
export function pdfSafe(s: string): string {
  return s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\n]/g, '?');
}

export async function exportPdf(board: Board, c: ExportCommon) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const t = i18n.getFixedT(c.lang, 'export');
  const doc = await PDFDocument.create();
  doc.setTitle(board.title || 'Diagonale');
  doc.setCreator('Diagonale');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(15 / 255, 61 / 255, 46 / 255);
  const vertical = c.orientation === 'vertical';
  const [pw, ph] = vertical ? [595.28, 841.89] : [841.89, 595.28];
  const date = new Intl.DateTimeFormat(c.lang, { dateStyle: 'long' }).format(new Date());
  for (let i = 0; i < board.phases.length; i++) {
    const page = doc.addPage([pw, ph]);
    const phase = board.phases[i]!;
    page.drawRectangle({ x: 0, y: ph - 48, width: pw, height: 48, color: green });
    page.drawText(pdfSafe(board.title || t('untitled')), { x: 28, y: ph - 31, size: 16, font: bold, color: rgb(0.957, 0.945, 0.918) });
    page.drawText(pdfSafe(phaseCaption(board, i, c.lang)), { x: 28, y: ph - 72, size: 13, font: bold, color: green });
    const imgW = pw - 56;
    const imgH = vertical ? imgW * 1.25 : imgW * 0.6;
    const blob = await renderPhasePng(board, i, { ...c, resolution: '1080p', captions: false });
    const img = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
    const scale = Math.min(imgW / img.width, imgH / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const top = ph - 84;
    page.drawImage(img, { x: (pw - dw) / 2, y: top - dh, width: dw, height: dh });
    let y = top - dh - 22;
    page.drawText(pdfSafe(`${t('duration')}: ${(phase.durationMs / 1000).toLocaleString(c.lang)} s  ·  ${t('hold')}: ${(phase.holdMs / 1000).toLocaleString(c.lang)} s`), {
      x: 28,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    if (phase.notes) {
      y -= 18;
      page.drawText(pdfSafe(t('notes')), { x: 28, y, size: 11, font: bold, color: green });
      for (const line of wrap(pdfSafe(phase.notes), 105)) {
        y -= 14;
        if (y < 40) break;
        page.drawText(line, { x: 28, y, size: 10, font });
      }
    }
    page.drawText(pdfSafe(`Diagonale · ${date} · ${i + 1}/${board.phases.length}`), { x: 28, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  }
  const bytes = await doc.save();
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${slugify(board.title)}.pdf`);
}

export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > max) {
        out.push(line);
        line = w;
      } else line = (line + ' ' + w).trim();
    }
    out.push(line);
  }
  return out;
}

export type VideoProgress = (fraction: number) => void;

const H264_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];

async function pickCodec(w: number, h: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of H264_CODECS) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: 8_000_000, framerate: fps });
      if (s.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Frame-by-frame video export from `evaluate` (not real time). MP4/H.264 via WebCodecs + mp4-muxer
 * where available, otherwise WebM via MediaRecorder (paced in real time).
 */
export async function exportVideo(
  board: Board,
  c: ExportCommon & { resolution: Resolution; fps?: number; audio?: Blob },
  onProgress: VideoProgress,
  signal?: AbortSignal,
): Promise<'mp4' | 'webm'> {
  const fps = c.fps ?? 30;
  const [w, h] = size(c.resolution, c.orientation);
  const total = timeline(board).totalMs + 600;
  const frames = Math.ceil((total / 1000) * fps);
  await preloadImages(board);
  const { r, dispose } = offscreen(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const renderAt = (tMs: number) => {
    const f = evaluate(board, tMs);
    r.render(board, f, opts(c, phaseCaption(board, f.phaseIndex, c.lang)));
    composite(r, ctx, w, h);
  };
  try {
    const codec = await pickCodec(w, h, fps);
    if (codec) {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const voice = c.audio ? await prepareAudio(c.audio, total / 1000) : null;
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: w, height: h, frameRate: fps },
        ...(voice ? { audio: { codec: 'opus' as const, sampleRate: AUDIO_RATE, numberOfChannels: voice.channels } } : {}),
        fastStart: 'in-memory',
      });
      if (voice) await encodeAudio(voice, (chunk, meta) => muxer.addAudioChunk(chunk, meta));
      let error: unknown = null;
      const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (error = e) });
      encoder.configure({ codec, width: w, height: h, bitrate: c.resolution === '1080p' ? 8_000_000 : 4_000_000, framerate: fps });
      for (let i = 0; i < frames; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (error) throw error;
        renderAt((i * 1000) / fps);
        const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 8) await new Promise((res) => setTimeout(res, 2));
        if (i % 5 === 0) {
          onProgress(i / frames);
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      await encoder.flush();
      encoder.close();
      muxer.finalize();
      const buf = (muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer;
      downloadBlob(new Blob([buf], { type: 'video/mp4' }), `${slugify(board.title)}.mp4`);
      onProgress(1);
      return 'mp4';
    }
    // ---- fallback: MediaRecorder (real time) ----
    const stream = canvas.captureStream(fps);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(200);
    const start = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        const el = performance.now() - start;
        renderAt(Math.min(el, total));
        onProgress(Math.min(1, el / total));
        if (el >= total) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop();
    await done;
    downloadBlob(new Blob(chunks, { type: 'video/webm' }), `${slugify(board.title)}.webm`);
    onProgress(1);
    return 'webm';
  } finally {
    dispose();
  }
}

export async function pngDataUrl(board: Board, phase: number, lang: string): Promise<string> {
  const blob = await renderPhasePng(board, phase, { lang, orientation: 'horizontal', resolution: '720p' });
  return await new Promise<string>((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(blob);
  });
}

const AUDIO_RATE = 48000;

type Voice = { buffer: AudioBuffer; channels: number; frames: number };

/** Decode + resample the Team Talk recording; null if Opus encoding is unavailable. */
async function prepareAudio(blob: Blob, seconds: number): Promise<Voice | null> {
  if (typeof AudioEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') return null;
  try {
    const ctx = new OfflineAudioContext(2, AUDIO_RATE, AUDIO_RATE);
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(2, buffer.numberOfChannels);
    const sup = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: AUDIO_RATE, numberOfChannels: channels, bitrate: 96000 });
    if (!sup.supported) return null;
    return { buffer, channels, frames: Math.min(buffer.length, Math.floor(seconds * AUDIO_RATE)) };
  } catch {
    return null;
  }
}

async function encodeAudio(v: Voice, output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void) {
  let error: unknown = null;
  const enc = new AudioEncoder({ output, error: (e) => (error = e) });
  enc.configure({ codec: 'opus', sampleRate: AUDIO_RATE, numberOfChannels: v.channels, bitrate: 96000 });
  const step = 960;
  for (let off = 0; off < v.frames; off += step) {
    if (error) throw error;
    const n = Math.min(step, v.frames - off);
    const data = new Float32Array(n * v.channels);
    for (let ch = 0; ch < v.channels; ch++) data.set(v.buffer.getChannelData(ch).subarray(off, off + n), ch * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: n, numberOfChannels: v.channels, timestamp: Math.round((off / AUDIO_RATE) * 1e6), data });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
}
