import { describe, expect, it } from 'vitest';
import { compareQuarters, isQuarterName, nextQuarter, quarterAt, quarterIndex, quarterMonths, quarterNumber } from './quarters';
import { isQuarterId, PLAYABLE_QUARTERS, playableQuarters, quarterAfter, setPlayableQuarters, stationDate } from '../game/quarters';
import { MAX_VIEW_PERIODS } from '../query/view.server';

describe('quarter names, past the two the game has built (endless.md)', () => {
  it('count from Q1 2194, and run on across years', () => {
    expect(quarterIndex('2194-Q1')).toBe(0);
    expect(quarterIndex('2195-Q1')).toBe(4);
    expect(quarterAt(7)).toBe('2195-Q4');
    for (let i = 0; i < 40; i++) expect(quarterIndex(quarterAt(i))).toBe(i);
    expect(nextQuarter('2194-Q4')).toBe('2195-Q1');
    expect(['2195-Q1', '2194-Q3', '2194-Q4'].sort((a, b) => compareQuarters(a as never, b as never))).toEqual(['2194-Q3', '2194-Q4', '2195-Q1']);
    expect(quarterMonths('2195-Q4')).toEqual(['2195-10', '2195-11', '2195-12']);
    expect(quarterNumber('2196-Q3')).toBe(3);
  });
  it('accept well-formed names from 2194 only', () => {
    for (const ok of ['2194-Q1', '2194-Q3', '2199-Q4']) expect(isQuarterName(ok)).toBe(true);
    for (const bad of ['2193-Q4', '2194-Q5', '2194-Q0', 'Q1', '2194-q1', ' 2194-Q1', 20194, null]) expect(isQuarterName(bad)).toBe(false);
  });
});

describe('the quarters the game plays today', () => {
  it('run on past Q2, now that the endless loop is on, until the panel removes the player', () => {
    expect(PLAYABLE_QUARTERS).toBe(400);
    // The query view allows 2193's four quarters and every playable one.
    expect(4 + PLAYABLE_QUARTERS).toBeLessThanOrEqual(MAX_VIEW_PERIODS);
    expect(playableQuarters()).toBe(400);
    expect(isQuarterId('2194-Q3')).toBe(true);
    expect([0, 1, 2].map(quarterAfter)).toEqual(['2194-Q1', '2194-Q2', '2194-Q3']);
    // Each quarter opens on its first day; after the last playable one, the station's date is the next quarter's.
    expect([0, 1, 2, 3, 4].map(stationDate)).toEqual(['2194-01-01', '2194-04-01', '2194-07-01', '2194-10-01', '2195-01-01']);
  });
  it('run on past Q2 once the game plays more of them', () => {
    setPlayableQuarters(6);
    try {
      expect(isQuarterId('2195-Q2')).toBe(true);
      expect(isQuarterId('2195-Q3')).toBe(false);
      expect([2, 5, 6].map(quarterAfter)).toEqual(['2194-Q3', '2195-Q2', null]);
    } finally { setPlayableQuarters(PLAYABLE_QUARTERS); }
  });
});
