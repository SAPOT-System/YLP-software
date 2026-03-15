import type { RegisterFormState, RegisterFormStateErrors } from "@/features/auth/types";
import { createFactory } from "../builders/factory.builder";

export const createRegisterFormState = createFactory<RegisterFormState>(() => ({
  username: "sam-user",
  firstName: "Sam",
  lastName: "Taylor",
  phoneNumber: "0900000000",
  email: "sam@example.com",
  password: "Secret123!",
  securityQuestion: "",
  questionAnswer: "",
  confirmPassword: "",
  termsChecked: false,
}));

export const createRegisterFormStateErrors =
  createFactory<RegisterFormStateErrors>(() => ({}));
