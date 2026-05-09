import { WsSignalingAdapter } from "../adapters/ws-signaling-adapter";

type Listener = (ids: string[]) => void;

export class ActiveUsersService {
  private _activeIds: string[] = [];
  private _listeners = new Set<Listener>();
  private _pollTimer: ReturnType<typeof setInterval> | undefined;
  private _pollCount = 0;
  private readonly _pollIntervalMs: number;

  constructor(
    private readonly wsAdapter: WsSignalingAdapter,
    pollIntervalMs = 10_000,
  ) {
    this._pollIntervalMs = pollIntervalMs;
    wsAdapter.on("active-users", (ids: string[]) => {
      this._activeIds = ids;
      this._listeners.forEach((l) => l(ids));
    });
    wsAdapter.on("open", () => this.requestActiveUsers());
  }

  requestActiveUsers(): void {
    if (!this.wsAdapter.isConnected) return;
    this.wsAdapter.sendGetActiveUsers();
  }

  startPolling(): void {
    this._pollCount++;
    if (this._pollCount === 1) {
      this._pollTimer = setInterval(
        () => this.requestActiveUsers(),
        this._pollIntervalMs,
      );
    }
  }

  stopPolling(): void {
    this._pollCount = Math.max(0, this._pollCount - 1);
    if (this._pollCount === 0 && this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  getActiveIds(): string[] {
    return this._activeIds;
  }

  isUserActive(userId: string): boolean {
    return this._activeIds.includes(userId);
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
