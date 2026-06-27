import { APP_ROUTES } from "@/config/routes";
import {
  RegisterStep1,
  TermsModal,
  useAuth,
  useRegister,
} from "@/features/auth";
import { RegisterFormState } from "@/features/auth/types";
import { validateRegistrationForm } from "@/features/auth/utils";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/core/api";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { authLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

type RegisterFormField = keyof RegisterFormState;
type OverlayPhase = "idle" | "loading" | "success" | "error";

const REGISTER_TIMEOUT_MS = 30_000;

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

  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [termsModalVisible, setTermsModalVisible] = useState(false);
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success") {
      router.replace(APP_ROUTES.HOME);
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

  const handleBlur = async (name: RegisterFormField) => {
    const fields: Partial<RegisterFormState> =
      name === "password" || name === "confirmPassword"
        ? { password: form.password, confirmPassword: form.confirmPassword }
        : { [name]: form[name] as string };
    const fieldErrors = validateRegistrationForm(fields);
    setErrors((prev) => ({ ...prev, ...fieldErrors }));

    if (name === "username" && form.username && !fieldErrors.username) {
      if (await checkIfIdentifierExists(form.username)) {
        authLog.warn("[Register] username exists on blur");
        setErrors((prev) => ({ ...prev, username: "Username already exists" }));
      }
    }
  };

  const handleSubmit = async (values: Partial<RegisterFormState>) => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      setOverlayPhase("error");
      setOverlayMessage("Cannot reach server. Please check your connection.");
      return;
    }

    const clientValidationResult = validateRegisterStep(values);
    if (!clientValidationResult.success) {
      authLog.warn("[Register] validation failed");
      return;
    }

    if (values.username && (await checkIfIdentifierExists(values.username))) {
      authLog.warn("[Register] username exists");
      setErrors({ username: "Username already exists" });
      return;
    }

    setErrors({});
    const fullForm = { ...form, ...values };
    setForm(fullForm);

    setOverlayPhase("loading");
    setOverlayMessage("");

    timeoutRef.current = setTimeout(() => {
      authLog.warn("[Register] registration timed out");
      setOverlayPhase("error");
      setOverlayMessage("Registration timed out. Please try again.");
    }, REGISTER_TIMEOUT_MS);

    const serverSideResult = await registerUser(fullForm);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (serverSideResult.success) {
      authLog.info("auth › register success");
      const { setPendingPassword } = await import("@/features/shared/main-container");
      setPendingPassword(fullForm.password);
      await auth.loginAfterRegister(serverSideResult.info!);
      setOverlayPhase("success");
      setOverlayMessage("Account created successfully!");
    } else {
      authLog.warn("auth › register failed");
      setOverlayPhase("error");
      setOverlayMessage("Account creation failed. Please try again.");
    }
  };

  const handleChange = (name: RegisterFormField, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleTermsPress = () => setTermsModalVisible(true);

  const handleTermsAccept = () => {
    setForm((prev) => ({ ...prev, termsChecked: true }));
    if (errors.termsChecked) {
      setErrors((prev) => ({ ...prev, termsChecked: undefined }));
    }
    setTermsModalVisible(false);
  };

  const handleTermsDismiss = () => setTermsModalVisible(false);

  useEffect(() => {
    if (errors.general) {
      authLog.warn("[Register] general error", { message: errors.general });
    }
  }, [errors.general]);

  const isSubmitting = overlayPhase !== "idle";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <LoadingOverlay
        visible={isSubmitting}
        text="Creating account..."
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
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
              loading={isSubmitting || loading}
              onChange={handleChange}
              onSubmit={handleSubmit}
              onBlur={handleBlur}
              onTermsPress={handleTermsPress}
            />
          </ScrollView>
        </ScreenContent>
      </View>

      <TermsModal
        visible={termsModalVisible}
        onAccept={handleTermsAccept}
        onDismiss={handleTermsDismiss}
      />
    </KeyboardAvoidingView>
  );
};

export default Register;
