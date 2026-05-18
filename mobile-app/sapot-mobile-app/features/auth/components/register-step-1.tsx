import { AUTH_ROUTES } from "@/config/routes";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Checkbox, HelperText, Text, useTheme } from "react-native-paper";
import { RegisterStepProps } from "../types";
import AuthTextInput from "./auth-text-input";
import PrimaryButton from "./primary-button";

export const RegisterStep1 = ({
  values,
  errors,
  onChange,
  onSubmit,
  loading,
}: RegisterStepProps) => {
  const theme = useTheme();

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
          label="First Name"
          placeholder="First Name"
          value={values.firstName}
          onChangeText={(value) => onChange("firstName", formatName(value))}
          style={styles.textInput}
          error={!!errors.firstName}
          required={true}
        />
        {errors.firstName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.firstName}
          </HelperText>
        )}

        <AuthTextInput
          label="Last Name"
          placeholder="Last Name"
          value={values.lastName}
          onChangeText={(value) => onChange("lastName", formatName(value))}
          style={styles.textInput}
          required={true}
          error={!!errors.lastName}
        />
        {errors.lastName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.lastName}
          </HelperText>
        )}

        <AuthTextInput
          label="Username"
          placeholder="Username"
          value={values.username}
          onChangeText={(value) => onChange("username", value)}
          style={styles.textInput}
          required={true}
          error={!!errors.username}
        />
        {errors.username && (
          <HelperText type="error" style={styles.helperText}>
            {errors.username}
          </HelperText>
        )}

        <AuthTextInput
          label="Password"
          placeholder="Password"
          value={values.password}
          onChangeText={(value) => onChange("password", value)}
          secureTextEntry
          style={styles.textInput}
          required={true}
          error={!!errors.password}
        />
        {errors.password && (
          <HelperText type="error" style={styles.helperText}>
            {errors.password}
          </HelperText>
        )}

        <AuthTextInput
          label="Confirm Password"
          placeholder="Confirm Password"
          value={values.confirmPassword}
          onChangeText={(value) => onChange("confirmPassword", value)}
          secureTextEntry
          style={styles.textInput}
          required={true}
          error={!!errors.confirmPassword}
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
                fontWeight: "semibold",
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
