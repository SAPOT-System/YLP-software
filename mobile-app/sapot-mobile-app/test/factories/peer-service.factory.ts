import { createFactory, createFactoryList } from "../builders/factory.builder";

export interface TestServiceTxt {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface TestZeroconfService {
  name: string;
  host: string;
  fullName: string;
  port: number;
  addresses: string[];
  txt: TestServiceTxt;
}

export interface TestDiscoveredService {
  serviceName: string;
  id: string;
  port: number;
  ipAddress: string;
  addresses: string[];
  lastSeenAt: number;
}

export const createTestZeroconfService = createFactory<TestZeroconfService>(
  () => ({
    name: "test-device",
    host: "test-device.local",
    fullName: "test-device.local.tcp",
    port: 8080,
    addresses: ["192.168.1.101"],
    txt: {
      id: "peer-1",
      username: "peeruser",
    },
  })
);

export const createTestDiscoveredService =
  createFactory<TestDiscoveredService>(() => ({
    serviceName: "test-device",
    id: "peer-1",
    port: 8080,
    ipAddress: "192.168.1.101",
    addresses: ["192.168.1.101"],
    lastSeenAt: Date.now(),
  }));

export const createTestDiscoveredServices = (
  count: number,
  overrides?:
    | Partial<TestDiscoveredService>
    | ((index: number) => Partial<TestDiscoveredService>)
) => createFactoryList(createTestDiscoveredService, count, overrides);
