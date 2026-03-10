import { AUTH_ROUTES } from "@/app/routes";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
import { RegisterStepProps } from "../types";
import PrimaryButton from "./primary-button";
import AuthTextInput from "./auth-text-input";

export const RegisterStep1 = ({
  values,
  errors,
  onChange,
  onSubmit,
  loading,
}: RegisterStepProps) => {
  const theme = useTheme();
  return (
    <>
      <View style={{ alignItems: "stretch", marginBottom: 20 }}>
        {/* First Name */}
        <AuthTextInput
          label="First Name"
          placeholder="First Name"
          value={values.firstName}
          onChangeText={(value) => onChange("firstName", value)}
          style={styles.textInput}
          error={!!errors.firstName}
          required={true}
        />
        {errors.firstName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.firstName}
          </HelperText>
        )}

        {/* Last Name */}
        <AuthTextInput
          label="Last Name"
          placeholder="Last Name"
          value={values.lastName}
          onChangeText={(value) => onChange("lastName", value)}
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
          mode="outlined"
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

        {/* Phone Number */}
        <AuthTextInput
          label="Phone Number"
          placeholder="Phone Number"
          value={values.phoneNumber}
          onChangeText={(value) => onChange("phoneNumber", value)}
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
        <AuthTextInput
          label="Email Address"
          placeholder="Email Address"
          value={values.email}
          onChangeText={(value) => onChange("email", value)}
          keyboardType="email-address"
          style={styles.textInput}
          error={!!errors.email}
        />
        {errors.email && (
          <HelperText type="error" style={styles.helperText}>
            {errors.email}
          </HelperText>
        )}
      </View>
      <View style={{ alignItems: "center" }}>
        {/* Submit Button */}
        <PrimaryButton
          onPress={() => onSubmit(values)}
          style={{ marginBottom: 8 }}
          loading={loading}
          disabled={loading}
        >
          Continue
        </PrimaryButton>

        {/* Login Link */}
        <Text variant="bodyMedium">
          Already have an account?{" "}
          <Link
            href={AUTH_ROUTES.LOGIN.SERVER_LOGIN}
            style={{
              textDecorationLine: "underline",
              color: theme.colors.inverseOnSurface,
            }}
          >
            Login Here
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
