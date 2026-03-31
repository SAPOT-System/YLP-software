import type { RegisterFormState } from "@/features/auth/types";

export interface RegisterNavigationMock {
  navigate: jest.MockedFunction<
    (screen: string, params?: Partial<RegisterFormState>) => void
  >;
  goBack: jest.MockedFunction<() => void>;
}

export function createRegisterNavigationMock(): RegisterNavigationMock {
  return {
    navigate: jest.fn<void, [string, (Partial<RegisterFormState> | undefined)?]>(),
    goBack: jest.fn<void, []>(),
  };
}

export function createRegisterCallbacks() {
  return {
    onChange: jest.fn<void, [keyof RegisterFormState, string | boolean]>(),
    onSubmit: jest.fn<void, [Partial<RegisterFormState>]>(),
    onBack: jest.fn(),
  };
}
