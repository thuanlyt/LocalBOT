import type { MediaTrack } from './media-types.js';

export type RepeatMode = 'off' | 'all' | 'one';

export type QueueSnapshot = {
  current: MediaTrack | null;
  queue: MediaTrack[];
  history: MediaTrack[];
  shuffle: boolean;
  repeatMode: RepeatMode;
};

/** Pure queue state used by the Discord player and future native control API. */
export class MusicQueue {
  private static readonly MAX_HISTORY = 100;
  private readonly items: MediaTrack[] = [];
  private readonly history: MediaTrack[] = [];
  private currentTrack: MediaTrack | null = null;
  private shuffleEnabled = false;
  private repeat: RepeatMode = 'off';

  get current(): MediaTrack | null {
    return this.currentTrack;
  }

  get length(): number {
    return this.items.length;
  }

  get shuffle(): boolean {
    return this.shuffleEnabled;
  }

  get repeatMode(): RepeatMode {
    return this.repeat;
  }

  add(track: MediaTrack): number {
    this.items.push(track);
    return this.items.length;
  }

  takeNext(): MediaTrack | null {
    if (this.items.length === 0) {
      this.currentTrack = null;
      return null;
    }

    const index = this.shuffleEnabled
      ? Math.floor(Math.random() * this.items.length)
      : 0;
    const [track] = this.items.splice(index, 1);
    this.currentTrack = track ?? null;
    return this.currentTrack;
  }

  private remember(track: MediaTrack): void {
    this.history.push(track);
    if (this.history.length > MusicQueue.MAX_HISTORY) this.history.shift();
  }

  completeCurrent(): MediaTrack | null {
    const completed = this.currentTrack;
    if (!completed) return this.takeNext();

    if (this.repeat === 'one') {
      return completed;
    }
    this.remember(completed);
    if (this.repeat === 'all') {
      this.items.push(completed);
    }
    return this.takeNext();
  }

  skipCurrent(): MediaTrack | null {
    if (this.currentTrack) this.remember(this.currentTrack);
    return this.takeNext();
  }

  failCurrent(): MediaTrack | null {
    return this.takeNext();
  }

  previous(): MediaTrack | null {
    const previousTrack = this.history.pop();
    if (!previousTrack) return null;
    if (this.currentTrack) this.items.unshift(this.currentTrack);
    this.currentTrack = previousTrack;
    return previousTrack;
  }

  removeAt(index: number): MediaTrack | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0] ?? null;
  }

  move(from: number, to: number): boolean {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= this.items.length ||
      to >= this.items.length
    ) return false;
    const [track] = this.items.splice(from, 1);
    if (!track) return false;
    this.items.splice(to, 0, track);
    return true;
  }

  clear(): void {
    this.items.length = 0;
    this.history.length = 0;
    this.currentTrack = null;
  }

  clearPending(): void {
    this.items.length = 0;
  }

  setShuffle(enabled: boolean): void {
    this.shuffleEnabled = enabled;
  }

  toggleShuffle(): boolean {
    this.shuffleEnabled = !this.shuffleEnabled;
    return this.shuffleEnabled;
  }

  setRepeatMode(mode: RepeatMode): RepeatMode {
    this.repeat = mode;
    return this.repeat;
  }

  cycleRepeat(): RepeatMode {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    return this.repeat;
  }

  restore(snapshot: QueueSnapshot): void {
    this.items.length = 0;
    this.items.push(...snapshot.queue);
    this.history.length = 0;
    this.history.push(...snapshot.history.slice(-MusicQueue.MAX_HISTORY));
    this.currentTrack = snapshot.current;
    this.shuffleEnabled = snapshot.shuffle;
    this.repeat = snapshot.repeatMode;
  }

  snapshot(): QueueSnapshot {
    return {
      current: this.currentTrack,
      queue: [...this.items],
      history: [...this.history],
      shuffle: this.shuffleEnabled,
      repeatMode: this.repeat
    };
  }
}
