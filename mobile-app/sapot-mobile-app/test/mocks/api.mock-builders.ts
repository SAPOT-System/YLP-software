export type AxiosInterceptorMock = {
  use: jest.Mock;
};

export type AxiosInterceptorsMock = {
  request: AxiosInterceptorMock;
};

export type AxiosInstanceMock = {
  interceptors: AxiosInterceptorsMock;
};

export function createMockInterceptorUse(): jest.Mock {
  return jest.fn((callback) => callback);
}

export function createMockAxiosInstance(
  interceptorUse = createMockInterceptorUse()
): AxiosInstanceMock {
  return {
    interceptors: {
      request: {
        use: interceptorUse,
      },
    },
  };
}
