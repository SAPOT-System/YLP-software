import { authTypesLog } from "@/features/shared/utils/logger";

authTypesLog.debug("[auth types] module loaded");

/**
 * Register types and interfaces
 */

export interface RegisterStepProps {
  values: RegisterFormState;
  errors: RegisterFormStateErrors;
  loading: boolean;
  onChange: (name: keyof RegisterFormState, value: string | boolean) => void;
  onSubmit: (values: Partial<RegisterFormState>) => void;
  onBack?: () => void;
}

export interface RegisterFormState {
  username: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  termsChecked: boolean;
}
export type RegisterFormStateErrors = Partial<
  Record<keyof RegisterFormState, string>
> & { general?: string };

export interface RegisterApiRequest {
  id?: string;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  email?: string;
}

type ApiRegisterFieldErrorResponse = Partial<
  Record<keyof RegisterApiRequest, string>
>;

interface ApiValidationErrorResponse {
  type: string;
  loc: string[];
  msg: string;
  input: unknown;
  ctx?: Record<string, unknown>;
}

export interface RegisterApiErrorResponse {
  // Used union type because of server response format is inconsistent
  detail: ApiValidationErrorResponse[] | ApiRegisterFieldErrorResponse;
}

export interface RegisterApiResponse {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  username: string;
  detail: string;
  access_token: string;
  refresh_token: string;
}

/**
 * Register types and interfaces
 */

export interface LoginApiRequest {
  username: string;
  password: string;
}

export interface LoginApiResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginApiErrorResponse {
  detail: string;
}
