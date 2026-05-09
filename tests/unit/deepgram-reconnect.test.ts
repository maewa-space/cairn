// Unit tests for the Deepgram channel's reconnect-and-resume behavior.
//
// We inject a fake WebSocket via __setWsFactoryForTesting and a fake
// BrowserWindow via vi.mock so the channel runs in isolation. Backoff
// delays are advanced with vi.useFakeTimers().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { events } = vi.hoisted(() => {
  return { events: [] as Array<{ channel: string; payload: unknown }> };
});

vi.mock('electron', () => {
  return {
    BrowserWindow: {
      getAllWindows: () => [
        {
          isDestroyed: () => false,
          webContents: {
            send: (channel: string, payload: unknown) => {
              events.push({ channel, payload });
            },
          },
        },
      ],
    },
  };
});

import {
  __createChannelForTesting,
  __setWsFactoryForTesting,
  type WsLike,
} from '../../src/main/services/deepgram.js';

class FakeWs implements WsLike {
  readyState = 0; // CONNECTING
  sent: Array<Buffer | string> = [];
  closedByUser = false;
  terminated = false;
  private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  on(event: 'open', handler: () => void): void;
  on(event: 'message', handler: (raw: { toString(): string }) => void): void;
  on(event: 'close', handler: (code: number, reason: Buffer) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  on(event: string, handler: (...args: never[]) => void): void {
    (this.handlers[event] ??= []).push(handler as (...args: unknown[]) => void);
  }

  send(data: Buffer | string): void {
    this.sent.push(data instanceof Buffer ? Buffer.from(data) : data);
  }

  close(): void {
    this.closedByUser = true;
  }

  terminate(): void {
    this.terminated = true;
  }

  // Test drivers
  fireOpen(): void {
    this.readyState = 1;
    for (const h of this.handlers['open'] ?? []) h();
  }
  fireClose(code = 1006, reason = 'abrupt'): void {
    this.readyState = 3;
    for (const h of this.handlers['close'] ?? []) h(code, Buffer.from(reason));
  }
  fireError(msg = 'boom'): void {
    for (const h of this.handlers['error'] ?? []) h(new Error(msg));
  }
}

let sockets: FakeWs[];

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  events.length = 0;
  sockets = [];
  // Channel logs ws errors via console.error — silence in tests so the
  // simulated error scenarios don't pollute the test runner output.
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  __setWsFactoryForTesting(() => {
    const ws = new FakeWs();
    sockets.push(ws);
    return ws;
  });
});

afterEach(() => {
  __setWsFactoryForTesting(null);
  consoleSpy.mockRestore();
  vi.useRealTimers();
});

function statesFor(speaker: string): string[] {
  return events
    .filter((e) => e.channel === 'deepgram:state')
    .map((e) => e.payload as { speaker: string; state: string })
    .filter((p) => p.speaker === speaker)
    .map((p) => p.state);
}

describe('DeepgramChannel reconnect-and-resume', () => {
  it('reconnects with exponential backoff after a non-user close', async () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    expect(sockets).toHaveLength(1);
    sockets[0].fireOpen();
    expect(statesFor('mic')).toEqual(['open']);

    // Abrupt close — should schedule a reconnect after 250ms.
    sockets[0].fireClose(1006, 'network blip');
    expect(statesFor('mic')).toEqual(['open', 'reconnecting']);
    expect(sockets).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(sockets).toHaveLength(2);

    // Successful reopen → 'reconnected' (not another 'open').
    sockets[1].fireOpen();
    expect(statesFor('mic')).toEqual(['open', 'reconnecting', 'reconnected']);
  });

  it('replays buffered PCM frames on reconnect', async () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    sockets[0].fireOpen();

    const f1 = Buffer.from([1, 2, 3, 4]);
    const f2 = Buffer.from([5, 6, 7, 8]);
    channel.send(f1);
    channel.send(f2);
    expect(sockets[0].sent).toHaveLength(2);

    // Drop the socket mid-session.
    sockets[0].fireClose(1011, 'idle timeout');
    await vi.advanceTimersByTimeAsync(250);
    expect(sockets).toHaveLength(2);

    // Send another frame while reconnecting (should be buffered, not lost).
    const f3 = Buffer.from([9, 10]);
    channel.send(f3);
    // socket 2 is still CONNECTING — nothing sent live yet.
    expect(sockets[1].sent).toHaveLength(0);

    sockets[1].fireOpen();
    // All three buffered frames should have been replayed.
    expect(sockets[1].sent).toHaveLength(3);
    expect((sockets[1].sent[0] as Buffer).equals(f1)).toBe(true);
    expect((sockets[1].sent[1] as Buffer).equals(f2)).toBe(true);
    expect((sockets[1].sent[2] as Buffer).equals(f3)).toBe(true);
  });

  it('does NOT reconnect after a user-initiated close', async () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    sockets[0].fireOpen();

    channel.close();
    expect(sockets[0].closedByUser).toBe(true);

    // Now simulate the WS finishing its close handshake.
    sockets[0].fireClose(1000, 'normal');
    await vi.advanceTimersByTimeAsync(5_000);

    // Only the original socket; no reconnect.
    expect(sockets).toHaveLength(1);
    // No 'reconnecting' broadcast.
    expect(statesFor('mic')).toEqual(['open']);
  });

  it('surfaces a terminal error after the reconnect budget is exhausted', async () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    sockets[0].fireOpen();

    // Each cycle: close → wait backoff → new socket → close again
    const delays = [250, 500, 1_000, 2_000];
    for (let i = 0; i < delays.length; i++) {
      sockets[i].fireClose(1006, 'flaky network');
      await vi.advanceTimersByTimeAsync(delays[i]);
    }
    // After the 4th attempt, we have 5 sockets total (initial + 4 retries).
    expect(sockets).toHaveLength(5);

    // The 5th socket also dies — budget exhausted, no further reconnect.
    sockets[4].fireClose(1006, 'flaky network');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(5);

    const closedState = events.find(
      (e) =>
        e.channel === 'deepgram:state' &&
        (e.payload as { state: string }).state === 'closed',
    );
    expect(closedState).toBeDefined();
    const terminalError = events.find(
      (e) =>
        e.channel === 'deepgram:error' &&
        /reconnect attempts/.test((e.payload as { message: string }).message),
    );
    expect(terminalError).toBeDefined();
  });

  it('caps the replay buffer to bound memory growth', () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    sockets[0].fireOpen();

    // Push way past the 96 KB cap.
    const frame = Buffer.alloc(8 * 1024); // 8 KB per frame
    for (let i = 0; i < 64; i++) channel.send(frame); // 512 KB total

    // Buffer should be bounded at <= 96 KB.
    const bytes = (
      channel as unknown as { __bufferBytesForTesting: () => number }
    ).__bufferBytesForTesting();
    expect(bytes).toBeLessThanOrEqual(96 * 1024);
    // And never empty (the eviction loop keeps at least one frame).
    expect(bytes).toBeGreaterThan(0);
  });

  it('suppresses transient ws errors during reconnect cycles', async () => {
    const channel = __createChannelForTesting({
      speaker: 'mic',
      apiKey: 'k',
      meetingId: 'm1',
    });
    channel.open();
    sockets[0].fireOpen();

    // Pre-reconnect error → forwarded.
    sockets[0].fireError('first error');
    expect(events.filter((e) => e.channel === 'deepgram:error')).toHaveLength(1);

    // Trigger reconnect cycle.
    sockets[0].fireClose(1006, 'blip');
    await vi.advanceTimersByTimeAsync(250);

    // Error during reconnect → suppressed.
    sockets[1].fireError('transient');
    expect(events.filter((e) => e.channel === 'deepgram:error')).toHaveLength(1);
  });
});
