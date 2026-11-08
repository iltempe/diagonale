import { describe, expect, it } from 'vitest';
import { createEmptyBoard, decodeShare, Dispatcher, encodeShare, shareUrl } from '../src';

describe('share links', () => {
  it('round-trips a full board in a compact URL-safe payload', () => {
    const d = new Dispatcher(createEmptyBoard({ id: 'b' }));
    d.dispatch('applyFormation', { team: 'home', formationId: '4-3-3' });
    d.dispatch('applyFormation', { team: 'away', formationId: '4-4-2' });
    for (let i = 0; i < 4; i++) d.dispatch('addPhase', {});
    const enc = encodeShare(d.board);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(enc.length).toBeLessThan(6000);
    expect(decodeShare(enc)).toEqual(d.board);
    expect(shareUrl(d.board, 'https://x.test/app/')).toContain('https://x.test/app/#/d/');
  });
});
