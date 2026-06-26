/**
 * IceRestartController — ICE-restart scheduling and backoff logic extracted
 * from WebrtcAdapter.
 *
 * All side effects (PC offer creation, event emission) are injected via
 * `IceRestartControllerOptions` closures so the adapter stays testable and
 * this unit has no native-module references.
 */
export interface IceRestartControllerOptions {
  /** Wraps PC.createOffer({ iceRestart: true }) + setLocalDescription. */
  createRestartOffer: () => Promise<{ type: string; sdp: string }>;
  /** Adapter emits the offer over signaling. */
  emitSignalOffer: (offer: { type: "offer"; sdp: string; iceRestart: true }) => void;
  /** Adapter emits "ice-restarting". */
  emitIceRestarting: () => void;
  /** Adapter emits "connection-failed". */
  emitConnectionFailed: (error?: unknown) => void;
  log?: (msg: string, data?: unknown) => void;
}

export class IceRestartController {
  private iceRestartTimer?: ReturnType<typeof setTimeout>;
  private iceRestartAttempts = 0;
  private readonly maxIceRestartAttempts = 3;
  private readonly iceRestartDelayMs = 1500;

  constructor(private readonly options: IceRestartControllerOptions) {}

  get attempts() {
    return this.iceRestartAttempts;
  }

  scheduleIceRestart(reason: "disconnected" | "failed", immediate = false) {
    this.options.log?.("webrtc › schedule ice restart", {
      reason,
      attempt: this.iceRestartAttempts + 1,
      max: this.maxIceRestartAttempts,
    });
    if (this.iceRestartAttempts >= this.maxIceRestartAttempts) {
      this.options.log?.("webrtc › ice restart attempts exceeded — emitting connection-failed", {
        reason,
        attempts: this.iceRestartAttempts,
      });
      this.options.emitConnectionFailed(new Error("ICE restart attempts exceeded"));
      return;
    }

    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = undefined;
    }

    // Notify upstream that a reconnect attempt is starting so the UI can
    // transition to a "reconnecting" state immediately.
    this.options.emitIceRestarting();

    const delayMs = immediate ? 0 : this.iceRestartDelayMs;
    this.iceRestartTimer = setTimeout(() => {
      this.iceRestartAttempts += 1;
      this.restartIce()
        .catch((err) => {
          this.options.log?.("webrtc › ice restart attempt threw", {
            err,
            attempt: this.iceRestartAttempts,
          });
        })
        .finally(() => {
          // ICE only transitions from "failed" → "checking" when the remote peer
          // applies our offer and sends an answer. If the peer is unreachable the
          // iceConnectionState stays "failed" and oniceconnectionstatechange never
          // re-fires, so the normal event-driven retry chain breaks here.
          // Arm a fallback timer: if ICE hasn't recovered after the peer answer
          // window, force the next attempt directly.
          this.iceRestartTimer = setTimeout(() => {
            this.scheduleIceRestart("failed", true);
          }, 5000);
        });
    }, delayMs);
  }

  async restartIce() {
    try {
      const offer = await this.options.createRestartOffer();
      this.options.emitSignalOffer({
        type: "offer",
        sdp: offer.sdp,
        iceRestart: true,
      });
    } catch (error) {
      this.options.log?.("webrtc › ice restart failed", { error });
    }
  }

  resetIceRestartState() {
    if (this.iceRestartAttempts > 0) {
      this.options.log?.("webrtc › ice restart state cleared", {
        attemptsUsed: this.iceRestartAttempts,
      });
    }
    this.iceRestartAttempts = 0;
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = undefined;
    }
  }
}
