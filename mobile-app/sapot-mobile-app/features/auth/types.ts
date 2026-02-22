/**
 * Register types and interfaces
 */

export interface RegisterFormState {
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
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
  phone_number: string;
  email: string;
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

export interface RegisterErrorResponse {
  // Used union type because of server response format is inconsistent
  detail: ApiValidationErrorResponse[] | ApiRegisterFieldErrorResponse;
}

interface RegisterApiSuccessResponse {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  username: string;
}
export interface RegisterResponse {
  data: RegisterApiSuccessResponse;
}
