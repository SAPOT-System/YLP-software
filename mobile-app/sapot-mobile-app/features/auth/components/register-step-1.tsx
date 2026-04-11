import { AUTH_ROUTES } from "@/app/routes";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { HelperText, Text, useTheme } from "react-native-paper";
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

  const formatPHNumber = (input: string) => {
    let num = input.replace(/[^0-9]/g, "");

    if (num.startsWith("639")) {
      num = "0" + num.slice(2);
    }

    if (num.startsWith("9")) {
      num = "0" + num;
    }

    return num.slice(0, 11);
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPHNumber(value);
    onChange("phoneNumber", formatted);
  };

  const formatName = (input: string) => {
    // Remove non-letter characters (allow accented letters)
    let cleaned = input.replace(/[^a-zA-ZÀ-ÿÑñ\s-]/g, "");

    // Convert to lowercase
    cleaned = cleaned.toLowerCase();

    // Capitalize first letter of each word
    cleaned = cleaned.replace(/\b\w/g, (char) => char.toUpperCase());

    return cleaned;
  };

  const handleFirstNameChange = (value: string) => {
    const formatted = formatName(value);
    onChange("firstName", formatted);
  };

  const handleLastNameChange = (value: string) => {
    const formatted = formatName(value);
    onChange("lastName", formatted);
  };
  return (
    <>
      <View style={{ alignItems: "stretch", marginBottom: 20 }}>
        {/* First Name */}
        <AuthTextInput
          label="First Name"
          placeholder="First Name"
          value={values.firstName}
          onChangeText={handleFirstNameChange}
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
          onChangeText={handleLastNameChange}
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
          onChangeText={(value) => {
            onChange("username", value);
          }}
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
          onChangeText={handlePhoneChange}
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
          onChangeText={(value) => {
            onChange("email", value);
          }}
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
          onPress={() => {
            onSubmit(values);
          }}
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
