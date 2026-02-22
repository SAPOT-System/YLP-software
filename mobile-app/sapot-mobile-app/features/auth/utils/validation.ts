import { RegisterFormState, RegisterFormStateErrors } from "../types";

export const validateRegistrationForm = ({
  username,
  firstName,
  lastName,
  email,
  phoneNumber,
  password,
  confirmPassword,
  termsChecked,
}: RegisterFormState): RegisterFormStateErrors => {
  const errors: RegisterFormStateErrors = {};

  // First Name validation
  if (!username.trim()) {
    errors.username = "Username is required";
  } else if (username.trim().length <= 2) {
    errors.username = "Username must be at least 2 characters";
  } else if (username.trim().length >= 50) {
    errors.username = "Username must be less than 50 characters";
  }

  // First Name validation
  if (!firstName.trim()) {
    errors.firstName = "First name is required";
  } else if (firstName.trim().length <= 2) {
    errors.firstName = "First name must be at least 2 characters";
  } else if (firstName.trim().length >= 50) {
    errors.firstName = "First name must be less than 50 characters";
  }

  // Last Name validation
  if (!lastName.trim()) {
    errors.lastName = "Last name is required";
  } else if (lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  } else if (lastName.trim().length > 50) {
    errors.lastName = "First name must be less than or equal to 50 characters";
  }

  // Phone Number validation
  if (!phoneNumber.trim()) {
    errors.phoneNumber = "Phone number is required";
  } else if (!/^\d{10,}$/.test(phoneNumber.replace(/\D/g, ""))) {
    errors.phoneNumber = "Phone number must be at least 10 digits";
  }

  // Email validation
  if (!email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Invalid email address";
  }

  // Password validation
  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  } else if (password.length > 128) {
    errors.password = "Password must be less than or equal to 128 characters";
  }

  // Confirm Password validation
  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your password";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  // Terms & Conditions validation
  if (!termsChecked) {
    errors.termsChecked = "You must agree to the terms and conditions";
  }

  return errors;
};

export const hasValidationErrors = (
  errors: RegisterFormStateErrors
): boolean => {
  return Object.keys(errors).length > 0;
};
