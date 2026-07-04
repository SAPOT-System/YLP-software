type Listener = () => void;

class DebugPanelStore {
  private _isOpen = false;
  private listeners = new Set<Listener>();

  get isOpen() {
    return this._isOpen;
  }

  open() {
    this.set(true);
  }

  close() {
    this.set(false);
  }

  toggle() {
    this.set(!this._isOpen);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(value: boolean) {
    if (this._isOpen === value) return;
    this._isOpen = value;
    this.listeners.forEach((listener) => listener());
  }
}

export const debugPanelStore = new DebugPanelStore();
