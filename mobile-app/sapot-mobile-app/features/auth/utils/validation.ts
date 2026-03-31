import { RegisterFormState, RegisterFormStateErrors } from "../types";

export const validateRegistrationForm = ({
  username,
  firstName,
  lastName,
  email,
  phoneNumber,
  password,
  questionAnswer,
  securityQuestion,
  confirmPassword,
  termsChecked,
}: Partial<RegisterFormState>): RegisterFormStateErrors => {
  const errors: RegisterFormStateErrors = {};
  // First Name validation
  if (username !== undefined && !username.trim()) {
    errors.username = "Username is required";
  } else if (username !== undefined && username.trim().length <= 2) {
    errors.username = "Username must be at least 2 characters";
  } else if (username !== undefined && username.trim().length >= 50) {
    errors.username = "Username must be less than 50 characters";
  }

  // First Name validation
  if (firstName !== undefined && !firstName.trim()) {
    errors.firstName = "First name is required";
  } else if (firstName !== undefined && firstName.trim().length <= 2) {
    errors.firstName = "First name must be at least 2 characters";
  } else if (firstName !== undefined && firstName.trim().length >= 50) {
    errors.firstName = "First name must be less than 50 characters";
  }

  // Last Name validation
  if (lastName !== undefined && !lastName.trim()) {
    errors.lastName = "Last name is required";
  } else if (lastName !== undefined && lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  } else if (lastName !== undefined && lastName.trim().length > 50) {
    errors.lastName = "First name must be less than or equal to 50 characters";
  }

  // Phone Number validation
  if (
    phoneNumber !== undefined &&
    phoneNumber.length > 0 &&
    !/^\d{10,}$/.test(phoneNumber.replace(/\D/g, ""))
  ) {
    errors.phoneNumber = "Phone number must be at least 10 digits";
  }

  // Email validation
  const emailError = validateEmail(email);
  if (emailError) {
    errors.email = emailError;
  }

  // Question validation
  if (securityQuestion !== undefined && !securityQuestion) {
    errors.securityQuestion = "Security question is required";
  }
  // Answer validation
  if (questionAnswer !== undefined && !questionAnswer) {
    errors.questionAnswer = "Answer is required";
  }

  // Password and confirm password validation
  Object.assign(errors, validatePassword(password, confirmPassword));

  // Terms & Conditions validation
  if (termsChecked !== undefined && !termsChecked) {
    errors.termsChecked = "You must agree to the terms and conditions";
  }

  return errors;
};

export const validateEmail = (email?: string) => {
  if (email !== undefined && email.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Invalid email address";
    }
  }

  return undefined;
};

export const hasValidationErrors = (
  errors:
    | RegisterFormStateErrors
    | { password?: string; confirmPassword?: string }
    | { firstName?: string; lastName?: string }
): boolean => {
  return Object.keys(errors).length > 0;
};

export const validatePassword = (
  password?: string,
  confirmPassword?: string
) => {
  const errors: { password?: string; confirmPassword?: string } = {};
  // Password validation
  if (password !== undefined && !password) {
    errors.password = "Password is required";
  } else if (password !== undefined && password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  } else if (password !== undefined && password.length > 128) {
    errors.password = "Password must be less than or equal to 128 characters";
  }

  // Confirm Password validation
  if (confirmPassword !== undefined && !confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
};

export const validateGuestLoginForm = (firstName: string, lastName: string) => {
  const errors: { firstName?: string; lastName?: string } = {};
  // First Name validation
  if (!firstName.trim()) {
    errors.firstName = "First name is required";
  } else if (firstName.trim().length <= 2) {
    errors.firstName = "First name must be at least 2 characters";
  } else if (firstName.trim().length >= 50) {
    errors.firstName = "First name must be less than 50 characters";
  }

  // Last Name validation
  if (lastName.trim().length < 2 && lastName.trim().length > 0) {
    errors.lastName = "Last name must be at least 2 characters";
  } else if (lastName.trim().length > 50 && lastName.trim().length > 0) {
    errors.lastName = "First name must be less than or equal to 50 characters";
  }

  return errors;
};
