import { discoverPhoneViaMdns, detectLocalIp, getLocalIps } from '@/discovery/mdns-discovery';
import { networkInterfaces } from 'os';

// -- Mock bonjour-service ------------------------------------------------------

const mockBrowserStop = jest.fn();
const mockBonjourDestroy = jest.fn();
let capturedCallback: ((service: unknown) => void) | null = null;

jest.mock('bonjour-service', () => {
  return jest.fn().mockImplementation(() => ({
    find: jest.fn().mockImplementation((_opts: unknown, cb: (service: unknown) => void) => {
      capturedCallback = cb;
      return { stop: mockBrowserStop };
    }),
    destroy: mockBonjourDestroy,
  }));
});

// -- Mock os.networkInterfaces ------------------------------------------------

jest.mock('os', () => ({ networkInterfaces: jest.fn() }));
const mockNetworkInterfaces = networkInterfaces as jest.Mock;

// -- Helpers -------------------------------------------------------------------

function makeService(overrides: Partial<{
  addresses: string[];
  port: number;
  txt: Record<string, string>;
}> = {}) {
  return {
    addresses: ['192.168.1.10'],
    port: 54321,
    txt: { id: 'user-abc-123', username: 'testuser' },
    ...overrides,
  };
}

// -- Tests ---------------------------------------------------------------------

// -- getLocalIps tests --------------------------------------------------------

describe('getLocalIps', () => {
  it('returns a set of all non-loopback local IPv4 addresses', () => {
    mockNetworkInterfaces.mockReturnValue({
      wlan0: [{ address: '192.168.1.99', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.99/24', mac: '' }],
      eth0:  [{ address: '10.0.0.5',    family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '10.0.0.5/24',    mac: '' }],
    });
    expect(getLocalIps()).toEqual(new Set(['192.168.1.99', '10.0.0.5']));
  });

  it('excludes loopback (internal) interfaces', () => {
    mockNetworkInterfaces.mockReturnValue({
      lo:    [{ address: '127.0.0.1',   family: 'IPv4', internal: true,  netmask: '255.0.0.0',     cidr: '127.0.0.1/8',   mac: '' }],
      wlan0: [{ address: '192.168.1.99', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.99/24', mac: '' }],
    });
    expect(getLocalIps()).toEqual(new Set(['192.168.1.99']));
  });

  it('excludes IPv6 addresses', () => {
    mockNetworkInterfaces.mockReturnValue({
      wlan0: [
        { address: '192.168.1.99', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.99/24', mac: '' },
        { address: 'fe80::1',      family: 'IPv6', internal: false, netmask: '/64',            cidr: 'fe80::1/64',      mac: '' },
      ],
    });
    expect(getLocalIps()).toEqual(new Set(['192.168.1.99']));
  });

  it('returns an empty set when no non-loopback IPv4 interfaces exist', () => {
    mockNetworkInterfaces.mockReturnValue({});
    expect(getLocalIps()).toEqual(new Set());
  });
});

// -- detectLocalIp tests ------------------------------------------------------

describe('detectLocalIp', () => {
  it('returns the laptop IP on the same /24 subnet as the phone', () => {
    mockNetworkInterfaces.mockReturnValue({
      wlan0: [{ address: '192.168.1.50', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.50/24', mac: '' }],
    });
    expect(detectLocalIp('192.168.1.10')).toBe('192.168.1.50');
  });

  it('returns undefined when no interface is on the phone subnet', () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '10.0.0.5/24', mac: '' }],
    });
    expect(detectLocalIp('192.168.1.10')).toBeUndefined();
  });

  it('skips loopback (internal) interfaces', () => {
    mockNetworkInterfaces.mockReturnValue({
      lo: [{ address: '192.168.1.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', cidr: '192.168.1.1/8', mac: '' }],
    });
    expect(detectLocalIp('192.168.1.10')).toBeUndefined();
  });

  it('skips IPv6 addresses', () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [{ address: 'fe80::1', family: 'IPv6', internal: false, netmask: '/64', cidr: 'fe80::1/64', mac: '' }],
    });
    expect(detectLocalIp('192.168.1.10')).toBeUndefined();
  });

  it('picks the first matching interface when multiple exist', () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '10.0.0.5/24', mac: '' }],
      wlan0: [{ address: '192.168.1.77', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.77/24', mac: '' }],
    });
    expect(detectLocalIp('192.168.1.10')).toBe('192.168.1.77');
  });
});

// -- discoverPhoneViaMdns tests -----------------------------------------------

describe('discoverPhoneViaMdns', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockBrowserStop.mockReset();
    mockBonjourDestroy.mockReset();
    capturedCallback = null;
    // Default: laptop is on the same subnet as the phone (192.168.1.x)
    mockNetworkInterfaces.mockReturnValue({
      wlan0: [{ address: '192.168.1.99', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.99/24', mac: '' }],
    });
  });

  it('resolves with ip, port, and userId when beacon arrives', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService());

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
    expect(result.port).toBe(54321);
    expect(result.userId).toBe('user-abc-123');
  });

  it('stops the browser and destroys bonjour after resolving', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService());
    await promise;

    expect(mockBrowserStop).toHaveBeenCalledTimes(1);
    expect(mockBonjourDestroy).toHaveBeenCalledTimes(1);
  });

  it('ignores a service missing addresses and waits for a complete one', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: [] }));   // incomplete — no IP
    capturedCallback!(makeService());                    // complete

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('skips IPv6-only addresses and waits for a service with a real IPv4', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: ['fe80::1%wlan0', '::1'] })); // IPv6 only
    capturedCallback!(makeService());                                          // IPv4

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('picks the IPv4 address when the list contains IPv6 followed by IPv4', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: ['fe80::1', '192.168.1.10'] }));

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('skips loopback addresses (127.x.x.x)', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: ['127.0.0.1'] })); // loopback only
    capturedCallback!(makeService());

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('skips link-local addresses (169.254.x.x)', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: ['169.254.1.5'] })); // link-local only
    capturedCallback!(makeService());

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('skips the laptop own IP even when it appears in service.addresses', async () => {
    // bonjour-service can include the querying machine's own IP; we must reject it
    // and wait for a service whose address is genuinely a remote (phone) IP.
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ addresses: ['192.168.1.99'] })); // laptop IP (mocked in beforeEach)
    capturedCallback!(makeService({ addresses: ['192.168.1.10'] })); // phone IP

    const result = await promise;
    expect(result.ip).toBe('192.168.1.10');
  });

  it('ignores a service missing the userId TXT field', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ txt: { username: 'noid' } })); // no id field
    capturedCallback!(makeService());

    const result = await promise;
    expect(result.userId).toBe('user-abc-123');
  });

  it('ignores a service with port 0', async () => {
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService({ port: 0 }));
    capturedCallback!(makeService());

    const result = await promise;
    expect(result.port).toBe(54321);
  });

  it('rejects with a timeout error when no beacon arrives', async () => {
    jest.useFakeTimers();
    const promise = discoverPhoneViaMdns(5);
    jest.advanceTimersByTime(5001);

    await expect(promise).rejects.toThrow(/timed out after 5s/i);
  });

  it('stops the browser and destroys bonjour on timeout', async () => {
    jest.useFakeTimers();
    const promise = discoverPhoneViaMdns(5);
    jest.advanceTimersByTime(5001);
    await promise.catch(() => undefined);

    expect(mockBrowserStop).toHaveBeenCalledTimes(1);
    expect(mockBonjourDestroy).toHaveBeenCalledTimes(1);
  });

  it('populates hostIp when a local interface is on the same subnet as the phone', async () => {
    mockNetworkInterfaces.mockReturnValue({
      wlan0: [{ address: '192.168.1.50', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.50/24', mac: '' }],
    });
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService()); // phone at 192.168.1.10
    const result = await promise;
    expect(result.hostIp).toBe('192.168.1.50');
  });

  it('hostIp is undefined when no local interface matches the phone subnet', async () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '10.0.0.5/24', mac: '' }],
    });
    const promise = discoverPhoneViaMdns(5);
    capturedCallback!(makeService()); // phone at 192.168.1.10
    const result = await promise;
    expect(result.hostIp).toBeUndefined();
  });
});
