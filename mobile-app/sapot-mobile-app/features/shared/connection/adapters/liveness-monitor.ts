/**
 * LivenessMonitor — application-level ping/pong probe over a WebRTC data channel.
 *
 * `connectionState === "connected"` can lie (half-open links after a Wi-Fi flap),
 * so we round-trip a ping/pong. Missed pongs force an ICE restart via the
 * injected `onLivenessLost` callback; a pong received while degraded is the
 * authoritative "peer is reachable again" signal.
 *
 * All side effects (frame send, ICE restart trigger, liveness-restored emit, logging)
 * are injected via `LivenessMonitorOptions` closures so the adapter can remain
 * testable and the monitor stays free of native-module references.
 */
export interface LivenessMonitorOptions {
  /** Called with the raw ping or pong frame object. Adapter serialises + sends. */
  send: (frame: unknown) => void;
  /** Called when consecutive missed pongs exceed the threshold. Adapter triggers ICE restart. */
  onLivenessLost: () => void;
  /** Called when a pong arrives after a degraded period. Adapter emits "liveness-restored". */
  onLivenessRestored: () => void;
  log?: (msg: string, data?: unknown) => void;
}

export class LivenessMonitor {
  private livenessPingTimer?: ReturnType<typeof setTimeout>;
  private livenessPongDeadline?: ReturnType<typeof setTimeout>;
  private livenessNonce = 0;
  private livenessMissedPongs = 0;
  private isAwaitingPong = false;
  private isLivenessDegraded = false;
  private readonly livenessPingIntervalMs = 4000;
  private readonly livenessPongTimeoutMs = 3000;
  private readonly maxMissedPongs = 2;

  // iceRestartAttempts is tracked here so handlePong can clear degraded state
  // (mirrors the adapter field that was checked in handleLivenessPong).
  private iceRestartAttempts = 0;

  constructor(private readonly options: LivenessMonitorOptions) {}

  /**
   * Notify the monitor that an ICE restart attempt is in progress.
   * Called by the adapter when it schedules a restart so the pong handler
   * can use this to decide whether to emit liveness-restored.
   */
  setIceRestartAttempts(attempts: number) {
    this.iceRestartAttempts = attempts;
  }

  /**
   * Begins periodic ping/pong probing. Safe to call repeatedly —
   * any in-flight monitor is cleared first.
   */
  start() {
    this.stop();
    this.options.log?.("webrtc › liveness monitor start");
    this.scheduleNextPing(this.livenessPingIntervalMs);
  }

  /** Stops probing and resets liveness state. Called on close/error/cleanup. */
  stop() {
    if (this.livenessPingTimer || this.livenessPongDeadline) {
      this.options.log?.("webrtc › liveness monitor stop", {
        wasDegraded: this.isLivenessDegraded,
      });
    }
    if (this.livenessPingTimer) {
      clearTimeout(this.livenessPingTimer);
      this.livenessPingTimer = undefined;
    }
    if (this.livenessPongDeadline) {
      clearTimeout(this.livenessPongDeadline);
      this.livenessPongDeadline = undefined;
    }
    this.isAwaitingPong = false;
    this.livenessMissedPongs = 0;
    this.isLivenessDegraded = false;
  }

  private scheduleNextPing(delayMs: number) {
    if (this.livenessPingTimer) {
      clearTimeout(this.livenessPingTimer);
    }
    this.livenessPingTimer = setTimeout(() => this.sendPing(), delayMs);
  }

  private sendPing() {
    this.livenessNonce += 1;
    const nonce = this.livenessNonce;
    this.isAwaitingPong = true;
    try {
      this.options.send({ type: "ping", data: { nonce } });
      this.options.log?.("webrtc › liveness ping sent", { nonce });
    } catch (error) {
      this.options.log?.("webrtc › liveness ping send failed", { error });
    }
    this.livenessPongDeadline = setTimeout(
      () => this.onPongTimeout(),
      this.livenessPongTimeoutMs
    );
  }

  private onPongTimeout() {
    if (!this.isAwaitingPong) return;
    this.isAwaitingPong = false;
    this.livenessMissedPongs += 1;
    this.options.log?.("webrtc › liveness pong timeout", {
      missed: this.livenessMissedPongs,
    });
    if (this.livenessMissedPongs >= this.maxMissedPongs) {
      this.onLost();
    }
    // Keep probing — at the steady cadence normally, immediately while degraded
    // so recovery is detected as soon as the peer is reachable again.
    this.scheduleNextPing(
      this.isLivenessDegraded ? 0 : this.livenessPingIntervalMs
    );
  }

  /** Handle an incoming ping from the remote peer — reply with a pong. */
  handlePing(nonce: number) {
    try {
      this.options.send({ type: "pong", data: { nonce } });
      this.options.log?.("webrtc › liveness ping received → pong", { nonce });
    } catch (error) {
      this.options.log?.("webrtc › liveness pong send failed", { error });
    }
  }

  /** Handle an incoming pong from the remote peer. */
  handlePong() {
    // Ignore unsolicited pongs once a cycle has already settled.
    if (
      !this.isAwaitingPong &&
      !this.isLivenessDegraded &&
      this.iceRestartAttempts === 0
    ) {
      return;
    }
    this.isAwaitingPong = false;
    if (this.livenessPongDeadline) {
      clearTimeout(this.livenessPongDeadline);
      this.livenessPongDeadline = undefined;
    }
    this.options.log?.("webrtc › liveness pong received", {
      missedBefore: this.livenessMissedPongs,
      degraded: this.isLivenessDegraded,
    });
    this.livenessMissedPongs = 0;

    // A completed round-trip is authoritative proof the peer is reachable. If we
    // had signalled "reconnecting" (degraded liveness or an in-flight ICE
    // restart), clear that state and tell upstream the link is healthy again so
    // a stale "Reconnecting…" header resolves even when the ICE state machine
    // never re-fired "connected".
    if (this.isLivenessDegraded || this.iceRestartAttempts > 0) {
      this.options.log?.("webrtc › liveness restored via pong");
      this.isLivenessDegraded = false;
      this.iceRestartAttempts = 0;
      this.options.onLivenessRestored();
    }
    this.scheduleNextPing(this.livenessPingIntervalMs);
  }

  private onLost() {
    if (this.isLivenessDegraded) return;
    this.isLivenessDegraded = true;
    this.options.log?.("webrtc › liveness lost — forcing ice restart");
    this.options.onLivenessLost();
  }
}
