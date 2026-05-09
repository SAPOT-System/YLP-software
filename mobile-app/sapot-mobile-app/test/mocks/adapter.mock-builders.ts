import type { MediaStream } from "react-native-webrtc";

export type TcpClientSocketMock = {
  on: jest.Mock;
  write: jest.Mock;
  destroy: jest.Mock;
};

export type TcpServerMock = {
  on: jest.Mock;
  listen: jest.Mock;
  close: jest.Mock;
};

export type ServerSocketMock = {
  on: jest.Mock;
};

export function createMockTcpClientSocket(
  overrides: Partial<TcpClientSocketMock> = {}
): TcpClientSocketMock {
  return {
    on: jest.fn(),
    write: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  };
}

export function createMockTcpServer(
  overrides: Partial<TcpServerMock> = {}
): TcpServerMock {
  return {
    on: jest.fn(),
    listen: jest.fn(),
    close: jest.fn(),
    ...overrides,
  };
}

export function createMockServerSocket(
  overrides: Partial<ServerSocketMock> = {}
): ServerSocketMock {
  return {
    on: jest.fn(),
    ...overrides,
  };
}

export type MediaTrackMock = {
  kind: string;
};

export function createMockMediaTrack(
  overrides: Partial<MediaTrackMock> = {}
): MediaTrackMock {
  return {
    kind: "audio",
    ...overrides,
  };
}

export function createMockMediaStream(
  id = "mock-stream",
  overrides: Record<string, unknown> = {}
): MediaStream {
  const audioTrack = createMockMediaTrack();

  const base = {
    id,
    active: true,
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
    getTracks: jest.fn().mockReturnValue([audioTrack]),
    getAudioTracks: jest.fn().mockReturnValue([audioTrack]),
    getVideoTracks: jest.fn().mockReturnValue([]),
    getTrackById: jest.fn(),
    clone: jest.fn(),
    toURL: jest.fn().mockReturnValue(`mock-url-${id}`),
    release: jest.fn(),
  };

  return {
    ...(base as unknown as MediaStream),
    ...(overrides as unknown as MediaStream),
  } as MediaStream;
}

export type RtcPeerConnectionMock = {
  addTrack: jest.Mock;
  createOffer: jest.Mock;
  createAnswer: jest.Mock;
  setLocalDescription: jest.Mock;
  setRemoteDescription: jest.Mock;
  addIceCandidate: jest.Mock;
  createDataChannel: jest.Mock;
  on: jest.Mock;
  addEventListener: jest.Mock;
};

export function createMockRtcPeerConnection(
  overrides: Partial<RtcPeerConnectionMock> = {}
): RtcPeerConnectionMock {
  return {
    addTrack: jest.fn(),
    createOffer: jest.fn(),
    createAnswer: jest.fn(),
    setLocalDescription: jest.fn(),
    setRemoteDescription: jest.fn(),
    addIceCandidate: jest.fn(),
    createDataChannel: jest.fn(),
    on: jest.fn(),
    addEventListener: jest.fn(),
    ...overrides,
  };
}
