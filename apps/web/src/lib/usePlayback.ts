import { useEffect } from 'react';
import { timeline } from '@diagonale/core';
import { useEditor } from '../store/editor';

/** Drives `t` with requestAnimationFrame while playing. */
export function usePlayback() {
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useEditor.getState();
      const dt = (now - last) * s.speed;
      last = now;
      const total = timeline(s.aiPreview?.board ?? s.board).totalMs;
      let t = s.t + dt;
      if (t >= total) {
        if (s.loop) t = 0;
        else {
          const tl = timeline(s.board);
          useEditor.setState({ t: total, playing: false, phase: tl.segments.length - 1 });
          return;
        }
      }
      const tl = timeline(s.aiPreview?.board ?? s.board);
      const seg = tl.segments.find((x) => t <= x.end) ?? tl.segments[tl.segments.length - 1]!;
      useEditor.setState({ t, phase: seg.phaseIndex });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
