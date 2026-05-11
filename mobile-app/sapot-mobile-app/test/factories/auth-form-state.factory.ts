import type { RegisterFormState, RegisterFormStateErrors } from "@/features/auth/types";
import { createFactory } from "../builders/factory.builder";

export const createRegisterFormState = createFactory<RegisterFormState>(() => ({
  username: "sam-user",
  firstName: "Sam",
  lastName: "Taylor",
  password: "Secret123!",
  confirmPassword: "Secret123!",
  termsChecked: false,
}));

export const createRegisterFormStateErrors =
  createFactory<RegisterFormStateErrors>(() => ({}));
