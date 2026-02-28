import { useRegister } from "@/features/auth";
import { RegisterFormState } from "@/features/auth/types";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import React, { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Checkbox,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";

type RegisterFormField = keyof RegisterFormState;

const Register = () => {
  const theme = useTheme();
  const router = useRouter();
  const { registerUser, loading, errors } = useRegister();

  // Form state
  const [form, setForm] = useState<RegisterFormState>({
    username: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    password: "",
    confirmPassword: "",
    termsChecked: false,
  });

  // Validation and UI state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  // For network and server errors
  useEffect(() => {
    if (errors.general) {
      showToast(errors.general);
    }
  }, [errors.general]);

  const handleChange = (name: RegisterFormField, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async () => {
    const result = await registerUser(form);

    if (result.success) {
      showToast("Account created successfully!");
      setTimeout(() => {
        // TODO: redirect to screen showing email verification
        router.replace("/getting-started/server-login");
      }, 1500);
    } else if (!result.success) {
      showToast("Account created failed!");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
      >
        <ScreenHeader headerName="Register Account" />
        <ScreenContent
          title="Welcome to SAPOT"
          description="Create an account to get started"
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ width: "100%" }}
          >
            <View style={{ alignItems: "stretch", marginBottom: 20 }}>
              {/* */}
              <TextInput
                mode="outlined"
                label="Username"
                placeholder="Username"
                value={form.username}
                onChangeText={(value) => handleChange("username", value)}
                style={styles.textInput}
                error={!!errors.username}
              />
              {errors.username && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.username}
                </HelperText>
              )}

              {/* First Name */}
              <TextInput
                mode="outlined"
                label="First Name"
                placeholder="First Name"
                value={form.firstName}
                onChangeText={(value) => handleChange("firstName", value)}
                style={styles.textInput}
                error={!!errors.firstName}
              />
              {errors.firstName && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.firstName}
                </HelperText>
              )}

              {/* Last Name */}
              <TextInput
                mode="outlined"
                label="Last Name"
                placeholder="Last Name"
                value={form.lastName}
                onChangeText={(value) => handleChange("lastName", value)}
                style={styles.textInput}
                error={!!errors.lastName}
              />
              {errors.lastName && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.lastName}
                </HelperText>
              )}

              {/* Phone Number */}
              <TextInput
                mode="outlined"
                label="Phone Number"
                placeholder="Phone Number"
                value={form.phoneNumber}
                onChangeText={(value) => handleChange("phoneNumber", value)}
                keyboardType="phone-pad"
                style={styles.textInput}
                error={!!errors.phoneNumber}
              />
              {errors.phoneNumber && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.phoneNumber}
                </HelperText>
              )}

              {/* Email Address */}
              <TextInput
                mode="outlined"
                label="Email Address"
                placeholder="Email Address"
                value={form.email}
                onChangeText={(value) => handleChange("email", value)}
                keyboardType="email-address"
                style={styles.textInput}
                error={!!errors.email}
              />
              {errors.email && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.email}
                </HelperText>
              )}

              {/* Password */}
              <TextInput
                mode="outlined"
                label="Password"
                placeholder="Password"
                value={form.password}
                onChangeText={(value) => handleChange("password", value)}
                secureTextEntry
                style={styles.textInput}
                error={!!errors.password}
              />
              {errors.password && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.password}
                </HelperText>
              )}

              {/* Confirm Password */}
              <TextInput
                mode="outlined"
                label="Confirm Password"
                placeholder="Confirm Password"
                value={form.confirmPassword}
                onChangeText={(value) => handleChange("confirmPassword", value)}
                secureTextEntry
                style={styles.textInput}
                error={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <HelperText type="error" style={styles.helperText}>
                  {errors.confirmPassword}
                </HelperText>
              )}

              {/* Terms & Conditions */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Checkbox
                  status={form.termsChecked ? "checked" : "unchecked"}
                  onPress={() => {
                    handleChange("termsChecked", !form.termsChecked);
                  }}
                />
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onPrimaryContainer }}
                >
                  I agree to{" "}
                  {/* TODO: Make this a link where it will show the terms and condition texts */}
                  <Text
                    variant="bodyMedium"
                    style={{
                      fontWeight: "bold",
                      textDecorationLine: "underline",
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
              {/* Submit Button */}
              <Button
                onPress={() => handleRegister()}
                mode="contained"
                style={{ width: 280, marginBottom: 8 }}
                loading={loading}
                disabled={loading}
              >
                Create Account
              </Button>

              {/* Login Link */}
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onPrimaryContainer }}
              >
                Already have an account?{" "}
                <Link
                  href="/getting-started/server-login"
                  style={{
                    fontWeight: "bold",
                    textDecorationLine: "underline",
                  }}
                >
                  Login Here
                </Link>
              </Text>
            </View>
          </ScrollView>
        </ScreenContent>

        {/* Toast Notification */}
        <Snackbar
          visible={toastVisible}
          onDismiss={() => setToastVisible(false)}
          duration={3000}
        >
          {toastMessage}
        </Snackbar>
      </View>
    </KeyboardAvoidingView>
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

export default Register;
