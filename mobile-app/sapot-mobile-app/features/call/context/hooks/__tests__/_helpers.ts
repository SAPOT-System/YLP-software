/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */

// Capture the handler a hook registered via service.on(eventName, handler).
export function captureHandler(serviceMock: any, eventName: string): (...args: any[]) => any {
  const call = [...serviceMock.on.mock.calls].reverse().find(([e]: any[]) => e === eventName);
  if (!call) throw new Error(`No handler registered for "${eventName}"`);
  return call[1];
}

export function makeCallServiceMock(overrides: Record<string, any> = {}) {
  return {
    on: jest.fn(),
    off: jest.fn(),
    startCall: jest.fn().mockResolvedValue(undefined),
    informPeerForIncomingCall: jest.fn().mockResolvedValue(undefined),
    terminateCallConnection: jest.fn().mockResolvedValue(undefined),
    markMissedIncomingCall: jest.fn().mockResolvedValue(undefined),
    getActiveCallId: jest.fn().mockReturnValue(undefined),
    handleRemoteCallEnded: jest.fn().mockResolvedValue(undefined),
    syncMediaState: jest.fn(),
    getLocalCam: jest.fn().mockReturnValue(undefined),
    toggleMic: jest.fn(),
    toggleCamera: jest.fn().mockResolvedValue(true),
    toggleSpeaker: jest.fn(),
    switchCamera: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function makeConnectionServiceMock(overrides: Record<string, any> = {}) {
  return {
    on: jest.fn(),
    off: jest.fn(),
    shouldIgnoreCallBusy: jest.fn().mockReturnValue(false),
    setActiveCall: jest.fn(),
    dismissIncomingCallNotification: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
