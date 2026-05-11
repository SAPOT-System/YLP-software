import { APP_ROUTES } from "@/config/routes";
import {
  RegisterStep1,
  useAuth,
  useRegister,
} from "@/features/auth";
import { RegisterFormState } from "@/features/auth/types";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

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

  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showToast, showError, hideToast } = useToast();
  const [form, setForm] = useState<RegisterFormState>({
    username: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
    termsChecked: false,
  });

  useEffect(() => {
    authLog.info("[Register] mounted");
    return () => {
      authLog.info("[Register] unmounted");
    };
  }, []);

  const handleSubmit = async (values: Partial<RegisterFormState>) => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      showToast("Cannot reach server. Please check your connection.");
      return;
    }

    const clientValidationResult = validateRegisterStep(values);
    if (!clientValidationResult.success) {
      authLog.warn("[Register] validation failed");
      return;
    }

    if (values.username && (await checkIfIdentifierExists(values.username))) {
      authLog.warn("[Register] username exists");
      setErrors({ username: "Username exists" });
      return;
    }

    setErrors({});
    const fullForm = { ...form, ...values };
    setForm(fullForm);
    const serverSideResult = await registerUser(fullForm);

    if (serverSideResult.success) {
      authLog.info("auth › register success");
      showToast("Account created successfully!");
      await auth.loginAfterRegister(serverSideResult.info!);
      router.replace(APP_ROUTES.HOME)
    } else {
      authLog.warn("auth › register failed");
      showError("Account creation failed!");
    }
  };

  const handleChange = (name: RegisterFormField, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (errors.general) {
      authLog.warn("[Register] general error", { message: errors.general });
      showError(errors.general);
    }
  }, [errors.general, showError]);

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
            <RegisterStep1
              values={form}
              errors={errors}
              loading={loading}
              onChange={handleChange}
              onSubmit={handleSubmit}
            />
          </ScrollView>
        </ScreenContent>

        <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
          {toastMessage}
        </AppSnackbar>
      </View>
    </KeyboardAvoidingView>
  );
};

export default Register;
