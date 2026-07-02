jest.mock('jwt-decode');
import { jwtDecode } from 'jwt-decode';
import { isTokenExpiredLocally } from '../token-utils';

const mockDecode = jwtDecode as jest.MockedFunction<typeof jwtDecode>;

describe('isTokenExpiredLocally', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true for an empty string', () => {
    expect(isTokenExpiredLocally('')).toBe(true);
  });

  it('returns true when jwtDecode throws (malformed token)', () => {
    mockDecode.mockImplementation(() => {
      throw new Error('Invalid token');
    });
    expect(isTokenExpiredLocally('bad.token')).toBe(true);
  });

  it('returns true when exp is in the past', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    mockDecode.mockReturnValue({ exp: pastExp } as never);
    expect(isTokenExpiredLocally('expired.token.here')).toBe(true);
  });

  it('returns false when exp is in the future', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    mockDecode.mockReturnValue({ exp: futureExp } as never);
    expect(isTokenExpiredLocally('valid.token.here')).toBe(false);
  });
});
