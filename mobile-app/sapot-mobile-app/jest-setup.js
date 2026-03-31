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
  Model: class MockModel {},
  Q: {
    where: jest.fn(),
    sortBy: jest.fn(),
    oneOf: jest.fn(),
    desc: jest.fn(),
    skip: jest.fn(),
    take: jest.fn()
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