import { AuthTextInput, PrimaryButton, useAuth } from "@/features/auth";
import { RegisterApiRequest, RegisterFormStateErrors } from "@/features/auth/types";
import { hasValidationErrors, validateRegistrationForm } from "@/features/auth/utils/validation";
import { useUserProfile } from "@/features/shared/hooks/use-user-profile";
import { uiLog } from "@/features/shared/utils/logger";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { HelperText } from "react-native-paper";

export default function Authenticate() {
  const { registerAndMigrate, loading } = useAuth();
  const { user } = useUserProfile();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<RegisterFormStateErrors>({});

  useEffect(() => {
    uiLog.info("[Authenticate] mounted");
    return () => {
      uiLog.info("[Authenticate] unmounted");
    };
  }, []);

  const handleSubmit = async () => {
    const next = validateRegistrationForm({ firstName, lastName, username, password, confirmPassword });
    setErrors(next);
    if (hasValidationErrors(next)) return;

    const data: RegisterApiRequest = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      username: username.trim(),
      password,
      terms_accepted: true,
    };

    const result = await registerAndMigrate(data);
    if (!result.success) {
      setErrors({ general: result.error ?? "Registration failed. Please try again." });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.fields}>
          <AuthTextInput
            label="First Name"
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            style={styles.input}
            error={!!errors.firstName}
            textContentType="givenName"
            autoComplete="given-name"
          />
          {errors.firstName && (
            <HelperText type="error" style={styles.helperText}>
              {errors.firstName}
            </HelperText>
          )}

          <AuthTextInput
            label="Last Name"
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
            error={!!errors.lastName}
            textContentType="familyName"
            autoComplete="family-name"
          />
          {errors.lastName && (
            <HelperText type="error" style={styles.helperText}>
              {errors.lastName}
            </HelperText>
          )}

          <AuthTextInput
            label="Username"
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            error={!!errors.username}
            textContentType="username"
            autoComplete="username"
          />
          {errors.username && (
            <HelperText type="error" style={styles.helperText}>
              {errors.username}
            </HelperText>
          )}

          <AuthTextInput
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            error={!!errors.password}
            textContentType="newPassword"
            autoComplete="new-password"
          />
          {errors.password && (
            <HelperText type="error" style={styles.helperText}>
              {errors.password}
            </HelperText>
          )}

          <AuthTextInput
            label="Confirm Password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            style={styles.input}
            error={!!errors.confirmPassword}
            textContentType="newPassword"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <HelperText type="error" style={styles.helperText}>
              {errors.confirmPassword}
            </HelperText>
          )}
        </View>

        <View style={styles.actions}>
          {errors.general && (
            <HelperText type="error" style={styles.generalError}>
              {errors.general}
            </HelperText>
          )}
          <PrimaryButton
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
          >
            Create Account
          </PrimaryButton>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingTop: 16,
  },
  fields: {
    alignItems: "stretch",
    marginBottom: 32,
  },
  input: {
    marginBottom: 4,
  },
  helperText: {
    marginBottom: 8,
  },
  actions: {
    alignItems: "center",
  },
  generalError: {
    textAlign: "center",
    marginBottom: 8,
  },
});
