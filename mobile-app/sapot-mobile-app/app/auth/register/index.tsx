import {
  RecoveryKeyDownloadModal,
  RegisterStep1,
  RegisterStep2,
  useRegister,
} from "@/features/auth";
import { RegisterFormState } from "@/features/auth/types";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useToast } from "@/features/shared/hooks";
import { Snackbar } from "react-native-paper";

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
  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();

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
        <Snackbar visible={toastVisible} onDismiss={hideToast} duration={3000}>
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

export default Register;
