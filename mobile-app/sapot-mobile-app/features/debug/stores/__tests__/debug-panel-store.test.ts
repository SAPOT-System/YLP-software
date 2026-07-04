import { debugPanelStore } from "../debug-panel-store";

afterEach(() => {
  debugPanelStore.close();
});

describe("debugPanelStore", () => {
  it("starts closed", () => {
    expect(debugPanelStore.isOpen).toBe(false);
  });

  it("open() sets isOpen to true", () => {
    debugPanelStore.open();

    expect(debugPanelStore.isOpen).toBe(true);
  });

  it("close() sets isOpen to false", () => {
    debugPanelStore.open();
    debugPanelStore.close();

    expect(debugPanelStore.isOpen).toBe(false);
  });

  it("toggle() flips isOpen", () => {
    debugPanelStore.toggle();
    expect(debugPanelStore.isOpen).toBe(true);

    debugPanelStore.toggle();
    expect(debugPanelStore.isOpen).toBe(false);
  });

  it("notifies subscribers only when the value actually changes", () => {
    const listener = jest.fn();
    const unsubscribe = debugPanelStore.subscribe(listener);

    debugPanelStore.open();
    debugPanelStore.open();
    expect(listener).toHaveBeenCalledTimes(1);

    debugPanelStore.close();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = debugPanelStore.subscribe(listener);
    unsubscribe();

    debugPanelStore.open();

    expect(listener).not.toHaveBeenCalled();
  });
});
