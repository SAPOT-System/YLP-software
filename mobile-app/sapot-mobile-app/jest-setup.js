import 'react-native-gesture-handler/jestSetup';

// Silence console outputs during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock react-native-webrtc
jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
  mediaDevices: {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn()
  }
}));

// Mock WatermelonDB
jest.mock('@nozbe/watermelondb', () => ({
  Database: jest.fn(),
  Q: {
    where: jest.fn(),
    sortBy: jest.fn()
  }
}));

// Mock network discovery
jest.mock('react-native-zeroconf', () => ({
  Zeroconf: jest.fn(() => ({
    scan: jest.fn(),
    stop: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn()
  }))
}));

// Mock TCP socket
jest.mock('react-native-tcp-socket', () => ({
  createConnection: jest.fn(),
  createServer: jest.fn()
}));