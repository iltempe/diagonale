import { describe, expect, it } from 'vitest';
import { Viewport, trimPolyline } from '../src/geometry';

const cam = { x: 0, y: 0, w: 105, h: 68 };

describe('Viewport', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (const perspective of ['flat', 'broadcast'] as const) {
      it(`round-trips meters ↔ pixels (${orientation}/${perspective})`, () => {
        const v = new Viewport(cam, 1200, 800, { orientation, perspective });
        for (const p of [{ x: 0, y: 0 }, { x: 52.5, y: 34 }, { x: 105, y: 68 }, { x: 20, y: 60 }]) {
          const back = v.toMeters(v.toScreen(p));
          expect(back.x).toBeCloseTo(p.x, 6);
          expect(back.y).toBeCloseTo(p.y, 6);
        }
        const c = v.toScreen({ x: 52.5, y: 34 });
        expect(c.x).toBeGreaterThan(0);
        expect(c.x).toBeLessThan(1200);
      });
    }
  }

  it('vertical: home goal at the bottom, left touchline on the left', () => {
    const v = new Viewport(cam, 800, 1200, { orientation: 'vertical', perspective: 'flat' });
    const ownGoal = v.toScreen({ x: 0, y: 34 });
    const oppGoal = v.toScreen({ x: 105, y: 34 });
    expect(ownGoal.y).toBeGreaterThan(oppGoal.y);
    expect(v.toScreen({ x: 50, y: 0 }).x).toBeLessThan(v.toScreen({ x: 50, y: 68 }).x);
  });

  it('broadcast: far side is smaller', () => {
    const v = new Viewport(cam, 1200, 800, { orientation: 'horizontal', perspective: 'broadcast' });
    expect(v.scaleAt({ x: 52, y: 2 })).toBeLessThan(v.scaleAt({ x: 52, y: 66 }));
  });

  it('trims polylines', () => {
    const t = trimPolyline([0, 0, 10, 0, 20, 0], 5, 5);
    expect(t[0]).toBeCloseTo(5);
    expect(t[t.length - 2]).toBeCloseTo(15);
  });
});
