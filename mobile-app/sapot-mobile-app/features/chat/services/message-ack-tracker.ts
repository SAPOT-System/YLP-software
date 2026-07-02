export class MessageAckTracker {
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  arm(messageId: string, onTimeout: () => void, ms: number): void {
    this.clear(messageId);
    this.timeouts.set(
      messageId,
      setTimeout(() => {
        this.timeouts.delete(messageId);
        onTimeout();
      }, ms),
    );
  }

  clear(messageId: string): void {
    const t = this.timeouts.get(messageId);
    if (t) {
      clearTimeout(t);
      this.timeouts.delete(messageId);
    }
  }

  clearAll(): void {
    for (const t of this.timeouts.values()) clearTimeout(t);
    this.timeouts.clear();
  }
}
