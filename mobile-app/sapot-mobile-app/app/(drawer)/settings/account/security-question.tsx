import { addSecurityQuestionApi } from "@/features/auth/api/auth.api";
import { SECURITY_QUESTIONS } from "@/features/auth/components/register-step-2";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { SettingsTextInput } from "@/features/settings";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { isAxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  Button,
  HelperText,
  useTheme,
} from "react-native-paper";
import { Dropdown } from "react-native-paper-dropdown";

export default function SecurityQuestion() {
  const theme = useTheme();
  const { setupQABlob } = useRecoveryKeySetup();

  const [password, setPassword] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<{
    password?: string;
    question?: string;
    answer?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
    showError,
    hideToast,
  } = useToast();

  useEffect(() => {
    uiLog.info("[SecurityQuestion] mounted");
    return () => {
      uiLog.info("[SecurityQuestion] unmounted");
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  const handleSave = async () => {
    uiLog.debug("[SecurityQuestion] handleSave called");
    const nextErrors = {
      password: password.trim() ? undefined : "Current password is required",
      question: selectedQuestion
        ? undefined
        : "Please select a security question",
      answer: answer.trim() ? undefined : "Answer is required",
    };
    setErrors(nextErrors);

    if (nextErrors.password || nextErrors.question || nextErrors.answer) {
      return;
    }

    try {
      setIsSaving(true);
      await addSecurityQuestionApi(
        [{ question: selectedQuestion, answer: answer.trim() }],
        password
      );
      try {
        await setupQABlob(selectedQuestion, answer.trim());
      } catch {
        showError(
          "Security question saved to server but could not be stored locally. You may need to set it up again on this device."
        );
        return;
      }
      setPassword("");
      setSelectedQuestion("");
      setAnswer("");
      setErrors({});
      showToast("Security question updated successfully");
      backTimerRef.current = setTimeout(() => {
        uiLog.info("[Navigation] goBack triggered from SecurityQuestion");
        router.back();
      }, 1000);
    } catch (error) {
      uiLog.error("[SecurityQuestion] Error updating security question", {
        error,
      });
      if (
        isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        setErrors({ password: "Incorrect password." });
      } else {
        showError("Failed to update security question. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 24 }}>
        <View style={{ alignItems: "stretch", width: "100%", gap: 4 }}>
          <View>
            <SettingsTextInput
              placeholder="Current Password"
              label="Current Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              secureTextEntry
            />
            <HelperText type="error" visible={Boolean(errors.password)}>
              {errors.password}
            </HelperText>
          </View>
          <Dropdown
            label="New Security Question"
            options={SECURITY_QUESTIONS}
            value={selectedQuestion}
            onSelect={(value) => {
              setSelectedQuestion(value ?? "");
              if (errors.question) {
                setErrors((prev) => ({ ...prev, question: undefined }));
              }
            }}
            placeholder="Select question"
            error={!!errors.question}
          />
          <HelperText type="error" visible={Boolean(errors.question)}>
            {errors.question}
          </HelperText>
          <View>
            <SettingsTextInput
              placeholder="Answer"
              label="Answer"
              value={answer}
              onChangeText={(value) => {
                setAnswer(value);
                if (errors.answer) {
                  setErrors((prev) => ({ ...prev, answer: undefined }));
                }
              }}
            />
            <HelperText type="error" visible={Boolean(errors.answer)}>
              {errors.answer}
            </HelperText>
          </View>
        </View>
        <Button
          mode="contained"
          style={{ width: 164 }}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
        >
          Save
        </Button>
      </View>
      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
  );
}
