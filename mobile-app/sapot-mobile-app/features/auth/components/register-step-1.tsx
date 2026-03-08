import { AUTH_ROUTES } from "@/app/routes";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  Button,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { RegisterStepProps } from "../types";

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
        <TextInput
          mode="outlined"
          label="First Name"
          placeholder="First Name"
          value={values.firstName}
          onChangeText={(value) => onChange("firstName", value)}
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
          value={values.lastName}
          onChangeText={(value) => onChange("lastName", value)}
          style={styles.textInput}
          error={!!errors.lastName}
        />
        {errors.lastName && (
          <HelperText type="error" style={styles.helperText}>
            {errors.lastName}
          </HelperText>
        )}

        <TextInput
          mode="outlined"
          label="Username"
          placeholder="Username"
          value={values.username}
          onChangeText={(value) => onChange("username", value)}
          style={styles.textInput}
          error={!!errors.username}
        />
        {errors.username && (
          <HelperText type="error" style={styles.helperText}>
            {errors.username}
          </HelperText>
        )}

        {/* Phone Number */}
        <TextInput
          mode="outlined"
          label="Phone Number (optional)"
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
        <TextInput
          mode="outlined"
          label="Email Address (optional)"
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
        <Button
          onPress={() => onSubmit(values)}
          mode="contained"
          style={{ width: 280, marginBottom: 8 }}
          loading={loading}
          disabled={loading}
        >
          Continue
        </Button>

        {/* Login Link */}
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onPrimaryContainer }}
        >
          Already have an account?{" "}
          <Link
            href={AUTH_ROUTES.LOGIN.SERVER_LOGIN}
            style={{ fontWeight: "bold", textDecorationLine: "underline" }}
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
