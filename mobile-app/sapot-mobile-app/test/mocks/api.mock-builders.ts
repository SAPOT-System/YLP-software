export type AxiosInterceptorMock = {
  use: jest.Mock;
};

export type AxiosInterceptorsMock = {
  request: AxiosInterceptorMock;
  response: AxiosInterceptorMock;
};

export type AxiosInstanceMock = {
  defaults: {
    baseURL?: string;
  };
  interceptors: AxiosInterceptorsMock;
};

export function createMockInterceptorUse(): jest.Mock {
  return jest.fn((callback) => callback);
}

export function createMockAxiosInstance(
  interceptorUse = createMockInterceptorUse()
): AxiosInstanceMock {
  return {
    defaults: {},
    interceptors: {
      request: {
        use: interceptorUse,
      },
      response: {
        use: interceptorUse,
      },
    },
  };
}
