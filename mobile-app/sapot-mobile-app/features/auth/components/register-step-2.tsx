import { AUTH_ROUTES } from "@/app/routes";
import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Checkbox,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { RegisterStepProps } from "../types";
import { Dropdown } from "react-native-paper-dropdown";

const SECURITY_QUESTIONS = [
  {
    label: "What's something your parents don't know?",
    value: "What's something your parents don't know?",
  },
  {
    label: "What is your biggest fear?",
    value: "What is your biggest fear?",
  },
  {
    label: "What is a fear you overcame?",
    value: "What is a fear you overcame?",
  },
  {
    label: "What was the one thing you failed badly at?",
    value: "What was the one thing you failed badly at?",
  },
];
export const RegisterStep2 = ({
  values,
  errors,
  loading,
  onChange,
  onSubmit,
  onBack,
}: RegisterStepProps) => {
  const theme = useTheme();
  return (
    <>
      <View style={{ alignItems: "stretch", marginBottom: 20 }}>
        <Dropdown
          label="Security Question"
          options={SECURITY_QUESTIONS}
          value={values.securityQuestion}
          onSelect={(value) => onChange("securityQuestion", value!)}
          placeholder="Select question"
          error={!!errors.securityQuestion}
        />
        {errors.securityQuestion && (
          <HelperText type="error" style={styles.helperText}>
            {errors.securityQuestion}
          </HelperText>
        )}

        {/* Answer */}
        <TextInput
          mode="outlined"
          label="Answer"
          placeholder="Answer"
          value={values.questionAnswer}
          onChangeText={(value) => onChange("questionAnswer", value)}
          style={styles.textInput}
          error={!!errors.questionAnswer}
        />
        {errors.questionAnswer && (
          <HelperText type="error" style={styles.helperText}>
            {errors.questionAnswer}
          </HelperText>
        )}

        <TextInput
          mode="outlined"
          label="Password"
          placeholder="Password"
          value={values.password}
          onChangeText={(value) => onChange("password", value)}
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
          value={values.confirmPassword}
          onChangeText={(value) => onChange("confirmPassword", value)}
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
            status={values.termsChecked ? "checked" : "unchecked"}
            onPress={() => {
              onChange("termsChecked", !values.termsChecked);
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
          onPress={() => onSubmit(values)}
          mode="contained"
          style={{ width: 280, marginBottom: 8 }}
          loading={loading}
          disabled={loading}
        >
          Create Account
        </Button>
        <Button
          onPress={onBack}
          mode="outlined"
          style={{ width: 280, marginBottom: 8 }}
          disabled={loading}
        >
          Back
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
