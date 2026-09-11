import { describe, expect, it } from 'vitest';
import { TimelineStore } from '../src/editor/timeline-store';

describe('TimelineStore', () => {
  it('creates tracks and persists clips', () => {
    const store = new TimelineStore();
    store.reset();
    const state = store.addClip({ assetId: 'asset-1', trackId: 'video-1', start: 0, duration: 10, sourceStart: 0, sourceDuration: 10 });
    expect(state.tracks[0].clips).toHaveLength(1);
    expect(new TimelineStore().snapshot().tracks[0].clips).toHaveLength(1);
    store.reset();
  });

  it('moves and trims a clip within valid bounds', () => {
    const store = new TimelineStore();
    store.reset();
    const created = store.addClip({ assetId: 'asset-1', trackId: 'video-1', start: 0, duration: 10, sourceStart: 0, sourceDuration: 10 });
    const id = created.selectedClipId!;
    expect(store.moveClip(id, 4).tracks[0].clips[0].start).toBe(4);
    expect(store.trimClip(id, 2, 5).tracks[0].clips[0].duration).toBe(5);
    store.reset();
  });

  it('splits a clip into two contiguous clips', () => {
    const store = new TimelineStore();
    store.reset();
    const created = store.addClip({ assetId: 'asset-1', trackId: 'video-1', start: 3, duration: 10, sourceStart: 0, sourceDuration: 10 });
    const state = store.splitClip(created.selectedClipId!, 4);
    const clips = state.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].start + clips[0].duration).toBe(clips[1].start);
    expect(clips[0].duration).toBe(4);
    expect(clips[1].duration).toBe(6);
    store.reset();
  });

  it('rejects invalid bounds', () => {
    const store = new TimelineStore();
    store.reset();
    expect(() => store.addClip({ assetId: 'asset-1', trackId: 'video-1', start: -1, duration: 1, sourceStart: 0, sourceDuration: 1 })).toThrow();
    expect(() => store.moveClip('missing', 2)).toThrow();
    expect(() => store.trimClip('missing', 0, 1)).not.toThrow();
    store.reset();
  });
});
