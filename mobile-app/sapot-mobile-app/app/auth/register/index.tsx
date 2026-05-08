import { APP_ROUTES } from "@/config/routes";
import {
  RecoveryKeyDownloadModal,
  RegisterStep1,
  RegisterStep2,
  useAuth,
  useRegister,
} from "@/features/auth";
import { RegisterFormState } from "@/features/auth/types";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useTheme } from "react-native-paper";

type RegisterFormField = keyof RegisterFormState;

const Register = () => {
  const {
    registerUser,
    errors,
    setErrors,
    loading,
    validateRegisterStep,
    checkIfIdentifierExists,
  } = useRegister();
  const auth = useAuth();

  // Form state
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showToast, showError, hideToast } = useToast();
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

  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState("");
  const showModal = () => {
    authLog.info("[Register] recovery key modal shown");
    setModalVisible(true);
  };
  const hideModal = () => {
    authLog.info("[Register] recovery key modal hidden");
    setModalVisible(false);
  };

  useEffect(() => {
    authLog.info("[Register] mounted");
    return () => {
      authLog.info("[Register] unmounted");
    };
  }, []);

  useEffect(() => {
    authLog.debug("[Register] useEffect triggered, deps:", {
      step,
      loading,
      hasErrors: Object.keys(errors).length > 0,
    });
  }, [step, loading, errors]);

  const handleStep1Submit = async (values: Partial<RegisterFormState>) => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }
    authLog.debug("[Register] handleStep1Submit called", {
      hasFirstName: Boolean(values.firstName),
      hasLastName: Boolean(values.lastName),
      hasPhoneNumber: Boolean(values.phoneNumber),
      hasEmail: Boolean(values.email),
      hasUsername: Boolean(values.username),
    });
    const step1Values = {
      firstName: values.firstName,
      lastName: values.lastName,
      phoneNumber: values.phoneNumber,
      email: values.email,
      username: values.username,
    };
    const clientValidationResult = validateRegisterStep(step1Values);
    if (!clientValidationResult.success) {
      authLog.warn("[Register] step1 validation failed");
      return;
    }

    if (values.username && (await checkIfIdentifierExists(values.username))) {
      authLog.warn("[Register] username exists");
      setErrors({ username: "Username exists" });
      return;
    }
    if (
      values.phoneNumber &&
      (await checkIfIdentifierExists(values.phoneNumber))
    ) {
      authLog.warn("[Register] phone number exists");
      setErrors({ phoneNumber: "Phone number exists" });
      return;
    }
    if (values.email && (await checkIfIdentifierExists(values.email))) {
      authLog.warn("[Register] email exists");
      setErrors({ email: "Email exists" });
      return;
    }
    setErrors({});
    setForm((prev) => ({ ...prev, ...values }));
    setStep(2);
    authLog.info("[Register] moved to step 2");
  };

  const handleStep2Submit = async (values: Partial<RegisterFormState>) => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }
    authLog.debug("[Register] handleStep2Submit called", {
      hasPassword: Boolean(values.password),
      hasConfirmPassword: Boolean(values.confirmPassword),
      hasSecurityQuestion: Boolean(values.securityQuestion),
      hasQuestionAnswer: Boolean(values.questionAnswer),
      termsChecked: Boolean(values.termsChecked),
    });
    const clientValidationResult = validateRegisterStep(values);
    if (!clientValidationResult.success) {
      authLog.warn("[Register] step2 validation failed");
      return;
    }

    const fullForm = { ...form, ...values };
    setForm(fullForm);
    const serverSideResult = await registerUser(fullForm);

    if (serverSideResult.success) {
      authLog.info("auth › register success", {
        hasRecoveryKeyLink: Boolean(serverSideResult.recoveryKeyFileLink),
      });
      showToast("Account created successfully!");
      setModalData(serverSideResult.recoveryKeyFileLink!);
      showModal();
      await auth.loginAfterRegister(serverSideResult.info!);
      // TODO: Store token from result.data
      // TODO: Update auth state
      // TODO: Reset navigation to main app
    } else if (!serverSideResult.success) {
      authLog.warn("auth › register failed");
      showError("Account creation failed!");
    }
  };

  const handleChange = (name: RegisterFormField, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // For network and server errors
  useEffect(() => {
    if (errors.general) {
      authLog.warn("[Register] general error", { message: errors.general });
      showError(errors.general);
    }
  }, [errors.general, showToast, showError]);

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
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              marginBottom: 16,
              width: "100%",
            }}
          >
            {[1, 2].map((s) => (
              <View
                key={s}
                style={{
                  height: 6,
                  flex: 1,
                  maxWidth: 80,
                  borderRadius: 3,
                  backgroundColor:
                    s <= step
                      ? theme.colors.primary
                      : theme.colors.surfaceVariant,
                }}
              />
            ))}
          </View>
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
        <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
          {toastMessage}
        </AppSnackbar>
        <RecoveryKeyDownloadModal
          visible={modalVisible}
          hideModal={hideModal}
          route={APP_ROUTES.HOME}
          fileData={modalData}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default Register;
