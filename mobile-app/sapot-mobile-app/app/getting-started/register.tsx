import { RecoveryKeyDownloadModal, useRegister } from "@/features/auth";
import {
  RegisterFormState,
  RegisterFormStateErrors,
} from "@/features/auth/types";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import React, { useEffect, useState } from "react";
import { Link } from "expo-router";
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
import { Dropdown } from "react-native-paper-dropdown";

type RegisterFormField = keyof RegisterFormState;

const Register = () => {
  // const router = useRouter();
  const {
    registerUser,
    errors,
    setErrors,
    loading,
    validateRegisterStep,
    checkIfIdentifierExists,
  } = useRegister();

  // Form state
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegisterFormState>({
    username: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    password: "",
    securityQuestion: "",
    questionAnswer: "",
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

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState("");
  const showModal = () => setModalVisible(true);
  const hideModal = () => setModalVisible(false);

  const handleStep1Submit = async (values: Partial<RegisterFormState>) => {
    const step1Values = {
      firstName: values.firstName,
      lastName: values.lastName,
      phoneNumber: values.phoneNumber,
      email: values.email,
      username: values.username,
    };
    const clientValidationResult = validateRegisterStep(step1Values);
    if (!clientValidationResult.success) return;

    if (values.username && (await checkIfIdentifierExists(values.username))) {
      setErrors({ username: "Username exists" });
      return;
    }
    if (
      values.phoneNumber &&
      (await checkIfIdentifierExists(values.phoneNumber))
    ) {
      setErrors({ phoneNumber: "Phone number exists" });
      return;
    }
    if (values.email && (await checkIfIdentifierExists(values.email))) {
      setErrors({ email: "Email exists" });
      return;
    }
    setErrors({});
    setForm((prev) => ({ ...prev, ...values }));
    setStep(2);
  };

  const handleStep2Submit = async (values: Partial<RegisterFormState>) => {
    const clientValidationResult = validateRegisterStep(values);
    if (!clientValidationResult.success) return;

    const fullForm = { ...form, ...values };
    setForm(fullForm);
    const serverSideResult = await registerUser(fullForm);

    if (serverSideResult.success) {
      // Success - store token, update auth state, reset navigation
      showToast("Account created successfully!");
      setModalData(serverSideResult.recoveryKeyFileLink!);
      showModal();
      // TODO: Store token from result.data
      // TODO: Update auth state
      // TODO: Reset navigation to main app
    } else if (!serverSideResult.success) {
      showToast("Account creation failed!");
    }
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
            <View>
              {step === 1 && (
                <RegisterStep1
                  values={form}
                  errors={errors}
                  loading={loading}
                  onChange={handleChange}
                  onSubmit={handleStep1Submit}
                />
              )}
              {step === 2 && (
                <RegisterStep2
                  values={form}
                  errors={errors}
                  loading={loading}
                  onSubmit={handleStep2Submit}
                  onChange={handleChange}
                  onBack={() => setStep(1)}
                />
              )}
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
        <RecoveryKeyDownloadModal
          visible={modalVisible}
          hideModal={hideModal}
          fileData={modalData}
        />
      </View>
    </KeyboardAvoidingView>
  );
};
interface RegisterStepProps {
  values: RegisterFormState;
  errors: RegisterFormStateErrors;
  loading: boolean;
  onChange: (name: RegisterFormField, value: string | boolean) => void;
  onSubmit: (values: Partial<RegisterFormState>) => void;
  onBack?: () => void;
}
const RegisterStep1 = ({
  values,
  errors,
  onChange,
  onSubmit,
  loading,
}: RegisterStepProps) => {
  const theme = useTheme();
  useEffect(() => {
    console.log("RegisterStep1", errors);
  }, [errors]);
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
            href="/getting-started/server-login"
            style={{ fontWeight: "bold", textDecorationLine: "underline" }}
          >
            Login Here
          </Link>
        </Text>
      </View>
    </>
  );
};

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
const RegisterStep2 = ({
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
            href="/getting-started/server-login"
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

export default Register;
