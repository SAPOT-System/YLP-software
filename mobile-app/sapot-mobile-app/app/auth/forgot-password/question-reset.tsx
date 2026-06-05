import { AUTH_ROUTES } from "@/config/routes";
import {
    AuthTextInput,
    canResetPasswordApi,
    PrimaryButton,
    SecondaryButton,
    StepDots,
    useGetQuestion,
    useVerifyAnswer,
} from "@/features/auth";
import { extractResetToken } from "@/features/auth/utils";
import { KeyRecoveryService } from "@/features/shared/services/key-recovery-service";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { HelperText } from "react-native-paper";

const QuestionResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const getQuestionResult = useGetQuestion(identifier);
  const { loading: gettingQuestionLoading, question, error: questionError, refetch } = getQuestionResult;

  const {
    error,
    verifyAnswer,
  } = useVerifyAnswer(identifier);

  const [overlayPhase, setOverlayPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [overlayMessage, setOverlayMessage] = useState("");
  const pendingNavRef = useRef<(() => void) | null>(null);
  const [answer, setAnswer] = useState("");
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

  const handleOverlayDismiss = useCallback(() => {
    if (overlayPhase === "success" && pendingNavRef.current) {
      pendingNavRef.current();
    }
    setOverlayPhase("idle");
    setOverlayMessage("");
  }, [overlayPhase]);

  useEffect(() => {
    authLog.info("[QuestionResetScreen] mounted");
    return () => {
      authLog.info("[QuestionResetScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    const checkStoredToken = async () => {
      try {
        const storedToken = await getItemAsync("reset_password_token");
        const storedIdentifier = await getItemAsync("reset_password_identifier");

        if (!storedToken || !storedIdentifier) return;
        if (storedIdentifier !== identifier) return;

        const isValid = await canResetPasswordApi(storedToken);

        if (isValid) {
          authLog.info("[Navigation] Navigating to ResetPassword", {
            screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
          });
          router.replace({
            pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
            params: { token: storedToken, identifier: storedIdentifier },
          });
        } else {
          await deleteItemAsync("reset_password_token");
          await deleteItemAsync("reset_password_identifier");
        }
      } catch (error) {
        authLog.error("[QuestionResetScreen] Error in check stored token", { error });
        await deleteItemAsync("reset_password_token");
        await deleteItemAsync("reset_password_identifier");
      } finally {
        setCheckingStoredToken(false);
      }
    };

    checkStoredToken();
  }, [identifier]);

  if (checkingStoredToken || gettingQuestionLoading) {
    return (
      <View style={{ flex: 1 }}>
        <LoadingOverlay visible />
      </View>
    );
  }

  if (questionError || !question) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}>
        <ScreenHeader headerName="Resetting Password" />
        <ScreenContent
          title="Password Recovery"
          description="We couldn't load your security question."
        >
          <HelperText type="error" visible>
            {questionError || "No security question found for this account."}
          </HelperText>
          <PrimaryButton
            style={{ marginBottom: 8 }}
            onPress={refetch}
          >
            Try Again
          </PrimaryButton>
          <SecondaryButton onPress={() => router.back()}>
            Back
          </SecondaryButton>
        </ScreenContent>
      </View>
    );
  }

  const handleVerify = async () => {
    const reachable = await checkBackEndHealth();
    if (!reachable) {
      setOverlayPhase("error");
      setOverlayMessage("Cannot reach server. Please check your connection.");
      return;
    }
    authLog.debug("[QuestionResetScreen] handleVerify called", {
      hasAnswer: Boolean(answer.trim()),
    });

    setOverlayPhase("loading");
    setOverlayMessage("");

    const res = await verifyAnswer({ question, answer });

    if (res.success && res.resetLink) {
      const token = extractResetToken(res.resetLink);

      await Promise.all([
        setItemAsync("reset_recovery_token", res.recoveryToken ?? ""),
        setItemAsync("reset_recovery_secret", KeyRecoveryService.normalizeAnswer(answer)),
        setItemAsync("reset_recovery_salt", question),
      ]);

      authLog.info("[Navigation] Navigating to ResetPassword", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
      });
      pendingNavRef.current = () =>
        router.push({
          pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
          params: { token, identifier, method: "qa" },
        });
      setOverlayPhase("success");
      setOverlayMessage("Answer verified!");
    } else {
      setOverlayPhase("error");
      setOverlayMessage(error.general || error.answer || "Verification failed. Please try again.");
    }
  };

  const isSubmitting = overlayPhase !== "idle";

  return (
    <View style={{ flex: 1 }}>
      <LoadingOverlay
        visible={isSubmitting}
        text="Verifying…"
        status={overlayPhase !== "idle" ? overlayPhase : "loading"}
        statusMessage={overlayMessage}
        onDismiss={handleOverlayDismiss}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
        >
          <ScreenHeader headerName="Resetting Password" />
          <StepDots total={3} current={2} />
          <ScreenContent
            title="Password Recovery"
            description="Please enter the answer to your security question"
          >
            <View
              style={{ width: "100%", alignItems: "stretch", marginBottom: 32 }}
            >
              <AuthTextInput
                label={question}
                placeholder="Enter your answer"
                value={answer}
                onChangeText={setAnswer}
                error={!!error.answer}
              />
              <HelperText type="error" visible={!!error.answer}>{error.answer}</HelperText>
            </View>
            <PrimaryButton
              onPress={handleVerify}
              loading={overlayPhase === "loading"}
              disabled={isSubmitting}
            >
              {overlayPhase === "loading" ? "Verifying…" : "Verify"}
            </PrimaryButton>
            <SecondaryButton
              style={{ marginTop: 16 }}
              onPress={() => {
                authLog.info("[Navigation] goBack triggered from QuestionReset");
                router.back();
              }}
              disabled={isSubmitting}
            >
              Back
            </SecondaryButton>
          </ScreenContent>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default QuestionResetScreen;
