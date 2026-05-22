import { AUTH_ROUTES } from "@/config/routes";
import { Link } from "expo-router";
import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Checkbox, HelperText, Text, useTheme } from "react-native-paper";
import { RegisterStepProps } from "../types";
import AuthTextInput, { PaperTextInputRef } from "./auth-text-input";
import { PasswordRequirements } from "./password-requirements";
import PrimaryButton from "./primary-button";

export const RegisterStep1 = ({
  values,
  errors,
  onChange,
  onSubmit,
  onBlur,
  loading,
}: RegisterStepProps) => {
  const theme = useTheme();

  const firstNameRef = useRef<PaperTextInputRef>(null);
  const lastNameRef = useRef<PaperTextInputRef>(null);
  const usernameRef = useRef<PaperTextInputRef>(null);
  const passwordRef = useRef<PaperTextInputRef>(null);
  const confirmPasswordRef = useRef<PaperTextInputRef>(null);

  const formatName = (input: string) => {
    let cleaned = input.replace(/[^a-zA-ZÀ-ÿÑñ\s-]/g, "");
    cleaned = cleaned.toLowerCase();
    cleaned = cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
    return cleaned;
  };

  return (
    <>
      <View style={{ alignItems: "stretch", marginBottom: 32 }}>
        <AuthTextInput
          ref={firstNameRef}
          label="First Name"
          placeholder="e.g. Juan"
          value={values.firstName}
          onChangeText={(value) => onChange("firstName", formatName(value))}
          onBlur={() => onBlur?.("firstName")}
          style={styles.textInput}
          error={!!errors.firstName}
          required={true}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => lastNameRef.current?.focus()}
        />
        {errors.firstName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.firstName}
          </HelperText>
        )}

        <AuthTextInput
          ref={lastNameRef}
          label="Last Name"
          placeholder="e.g. Dela Cruz"
          value={values.lastName}
          onChangeText={(value) => onChange("lastName", formatName(value))}
          onBlur={() => onBlur?.("lastName")}
          style={styles.textInput}
          required={true}
          error={!!errors.lastName}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
        />
        {errors.lastName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.lastName}
          </HelperText>
        )}

        <AuthTextInput
          ref={usernameRef}
          label="Username"
          placeholder="e.g. juan_delacruz"
          value={values.username}
          onChangeText={(value) => onChange("username", value)}
          onBlur={() => onBlur?.("username")}
          style={styles.textInput}
          required={true}
          error={!!errors.username}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        {errors.username && (
          <HelperText type="error" style={styles.helperText}>
            {errors.username}
          </HelperText>
        )}

        <AuthTextInput
          ref={passwordRef}
          label="Password"
          placeholder="Min. 8 characters"
          value={values.password}
          onChangeText={(value) => onChange("password", value)}
          onBlur={() => onBlur?.("password")}
          secureTextEntry
          style={styles.textInput}
          required={true}
          error={!!errors.password}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="next"
          onSubmitEditing={() => confirmPasswordRef.current?.focus()}
        />
        <PasswordRequirements password={values.password} />
        {errors.password && (
          <HelperText type="error" style={styles.helperText}>
            {errors.password}
          </HelperText>
        )}

        <AuthTextInput
          ref={confirmPasswordRef}
          label="Confirm Password"
          placeholder="Re-enter your password"
          value={values.confirmPassword}
          onChangeText={(value) => onChange("confirmPassword", value)}
          onBlur={() => onBlur?.("confirmPassword")}
          secureTextEntry
          style={styles.textInput}
          required={true}
          error={!!errors.confirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
        />
        {errors.confirmPassword && (
          <HelperText type="error" style={styles.helperText}>
            {errors.confirmPassword}
          </HelperText>
        )}

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Checkbox
            status={values.termsChecked ? "checked" : "unchecked"}
            onPress={() => onChange("termsChecked", !values.termsChecked)}
          />
          <Text variant="bodyMedium">
            I agree to{" "}
            <Text
              variant="bodyMedium"
              style={{
                fontWeight: "600",
                color: theme.colors.inverseOnSurface,
              }}
            >
              Terms & Conditions
            </Text>
          </Text>
        </View>
        {errors.termsChecked && (
          <HelperText type="error" style={styles.helperText}>
            {errors.termsChecked}
          </HelperText>
        )}
      </View>

      <View style={{ alignItems: "center" }}>
        <PrimaryButton
          onPress={() => onSubmit(values)}
          style={{ marginBottom: 8 }}
          loading={loading}
          disabled={loading}
        >
          Create Account
        </PrimaryButton>

        <Text variant="bodyMedium">
          Already have an account?{" "}
          <Link
            href={AUTH_ROUTES.LOGIN.SERVER_LOGIN}
            style={{
              textDecorationLine: "underline",
              color: theme.colors.primary,
            }}
          >
            Login here
          </Link>
        </Text>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  textInput: {
    marginBottom: 4,
  },
  helperText: {
    marginBottom: 8,
  },
});
