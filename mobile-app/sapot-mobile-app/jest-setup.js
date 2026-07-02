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

// Mock Reactotron to avoid XMLHttpRequest usage in Jest
jest.mock('reactotron-react-native', () => ({
  display: jest.fn(),
}));

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  wrap: (Component) => Component,
  init: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({})),
  feedbackIntegration: jest.fn(() => ({})),
  getGlobalScope: jest.fn(() => ({ setTag: jest.fn() })),
}));

// Mock axios to avoid fetch adapter issues in Jest
// Preserve AxiosError and isAxiosError from the real module so error-handling
// utilities that depend on them work correctly in tests.
jest.mock('axios', () => {
  const actualAxios = jest.requireActual('axios');

  const create = jest.fn(() => ({
    defaults: {},
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  }));

  return {
    __esModule: true,
    default: { ...actualAxios.default, create },
    create,
    isAxiosError: actualAxios.isAxiosError,
    AxiosError: actualAxios.AxiosError,
  };
});

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
  Model: class MockModel {},
  Q: {
    where: jest.fn(),
    sortBy: jest.fn(),
    oneOf: jest.fn(),
    desc: jest.fn(),
    asc: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    notEq: jest.fn(),
  },
  tableSchema: jest.fn((config) => config),
  appSchema: jest.fn((config) => config),
  field: () => () => {},
  date: () => () => {},
  text: () => () => {},
  readonly: () => () => {},
  relation: () => () => {},
  lazy: () => () => {},
  immutableRelation: () => () => {},
  children: () => () => {},
  json: () => () => {},
  writer: () => () => {},
  reader: () => () => {}
}));

// Mock SQLiteAdapter
jest.mock('@nozbe/watermelondb/adapters/sqlite', () => {
  const mockAdapter = jest.fn().mockImplementation(() => ({}));
  return {
    __esModule: true,
    default: mockAdapter,
    SQLiteAdapter: mockAdapter
  };
});

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

// Mock InCallManager
jest.mock('react-native-incall-manager', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
  setSpeakerphoneOn: jest.fn(),
  setForceSpeakerphoneOn: jest.fn(),
  chooseAudioRoute: jest.fn(),
  getAudioRoutes: jest.fn().mockResolvedValue([]),
}));

// Mock reanimated for components
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
   
  return Reanimated;
});

// Mock Lottie
jest.mock('lottie-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props) => React.createElement(View, { ...props, testID: props.testID || 'lottie-view' });
});

// Mock expo-router
jest.mock('expo-router', () => {
  const push = jest.fn();
  const replace = jest.fn();
  const back = jest.fn();
  return {
    router: { push, replace, back },
    useRouter: () => ({ push, replace, back })
  };
});

// Mock Expo task APIs used by background signaling task
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
  isTaskDefined: jest.fn().mockReturnValue(true),
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: jest.fn().mockResolvedValue(undefined),
  BackgroundTaskResult: {
    Success: 'Success',
    Failed: 'Failed',
  },
}));

// Mock expo-file-system (new API: File / Directory / Paths) used by the logger's
// file transport. Keeps file writes as no-ops in the Node test environment.
jest.mock('expo-file-system', () => {
  class File {
    constructor(uri) {
      this.uri = uri;
      this.exists = false;
    }
    create() {}
    delete() {}
    open() {
      return { writeBytes() {}, close() {}, size: 0, offset: 0 };
    }
  }
  return {
    File,
    Directory: class Directory {},
    Paths: { document: { uri: 'file:///mock/documents/' } },
  };
});

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: {
    LOW: 2,
    DEFAULT: 3,
    HIGH: 4,
  },
}));

// Mock react-native-quick-base64 (TurboModule not available in Jest)
jest.mock('react-native-quick-base64', () => ({
  btoa: (data) => Buffer.from(data, 'binary').toString('base64'),
  atob: (data) => Buffer.from(data, 'base64').toString('binary'),
  fromByteArray: (data) => Buffer.from(data).toString('base64'),
  toByteArray: (data) => new Uint8Array(Buffer.from(data, 'base64')),
}));

// Mock react-native-quick-crypto (TurboModule not available in Jest)
jest.mock('react-native-quick-crypto', () => {
  const crypto = require('crypto');
  return {
    __esModule: true,
    default: {
      pbkdf2: (secret, salt, iterations, keylen, digest, callback) => {
        crypto.pbkdf2(secret, salt, iterations, keylen, digest, (err, key) => {
          callback(err, key ? new Uint8Array(key) : null);
        });
      },
      pbkdf2Sync: (secret, salt, iterations, keylen, digest) => {
        const key = crypto.pbkdf2Sync(secret, salt, iterations, keylen, digest);
        return new Uint8Array(key);
      },
    },
  };
});

// Mock document picker (native module)
jest.mock('@react-native-documents/picker', () => ({
  saveDocuments: jest.fn(),
  pick: jest.fn(),
  getCacheDir: jest.fn(),
  isKnownType: jest.fn()
}));

// Mock react-native-paper minimal API
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { Text, View, TextInput } = require('react-native');
  const AvatarText = ({ label, ...props }) =>
    React.createElement(View, props, React.createElement(Text, null, label));

  return {
    Text: ({ children, ...props }) => React.createElement(Text, props, children),
    Avatar: {
      Text: AvatarText
    },
    ActivityIndicator: (props) =>
      React.createElement(View, { ...props, testID: props?.testID || 'activity-indicator' }),
    Icon: ({ source, size = 20 }) =>
      React.createElement(View, { accessibilityLabel: typeof source === 'string' ? source : 'icon', style: { width: size, height: size } }),
    TextInput: React.forwardRef((props, ref) => React.createElement(TextInput, { ...props, ref })),
    useTheme: () => ({
      colors: {
        primary: '#2f6fed',
        primaryContainer: '#d7e3ff',
        onPrimaryContainer: '#1b1b1f',
        inverseOnSurface: '#f4f4f4',
        elevation: { level5: '#e0e0e0' },
        surface: '#ffffff',
        outline: '#7a7a7a'
      }
    }),
    Provider: ({ children }) => React.createElement(React.Fragment, null, children)
  };
});

// Mock WatermelonDB react HOC
jest.mock('@nozbe/watermelondb/react', () => {
  const React = require('react');
  return {
    withObservables: (_keys, getProps) => (Component) => (props) => {
      const extraProps = typeof getProps === 'function' ? getProps(props) : {};
      return React.createElement(Component, { ...props, ...extraProps });
    }
  };
});