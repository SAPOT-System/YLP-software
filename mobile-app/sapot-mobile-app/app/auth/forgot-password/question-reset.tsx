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
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import { checkBackEndHealth } from "@/features/shared/api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { useToast } from "@/features/shared/hooks";
import { authLog } from "@/features/shared/utils/logger";
import { router, useLocalSearchParams } from "expo-router";
import { deleteItemAsync, getItemAsync } from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { HelperText } from "react-native-paper";

const QuestionResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const getQuestionResult = useGetQuestion(identifier);
  const { loading: gettingQuestionLoading, question, error: questionError } = getQuestionResult;
  console.log("qe",questionError)

  const {
    loading: verifyAnswerLoading,
    error,
    verifyAnswer,
  } = useVerifyAnswer(identifier);

  const { visible: toastVisible, message: toastMessage, variant: toastVariant, showError, hideToast } = useToast();
  const [answer, setAnswer] = useState("");
  const [checkingStoredToken, setCheckingStoredToken] = useState(true);

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
            onPress={() => router.back()}
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
      showError("Cannot reach server. Please check your connection.");
      return;
    }
    authLog.debug("[QuestionResetScreen] handleVerify called", {
      hasAnswer: Boolean(answer.trim()),
    });
    const res = await verifyAnswer({ question, answer });

    if (res.success && res.resetLink) {
      const token = res.resetLink.split("token=")[1];

      authLog.info("[Navigation] Navigating to ResetPassword", {
        screen: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
      });
      router.push({
        pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
        params: { token, identifier },
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
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
            <HelperText type="error" visible={!!error.general}>{error.general}</HelperText>
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
            loading={verifyAnswerLoading}
            disabled={verifyAnswerLoading}
          >
            Verify
          </PrimaryButton>
          <SecondaryButton
            style={{ marginTop: 16 }}
            onPress={() => {
              authLog.info("[Navigation] goBack triggered from QuestionReset");
              router.back();
            }}
            disabled={verifyAnswerLoading}
          >
            Back
          </SecondaryButton>
        </ScreenContent>
      </View>
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </KeyboardAvoidingView>
  );
};

export default QuestionResetScreen;
