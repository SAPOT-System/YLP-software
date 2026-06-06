import { addSecurityQuestionApi, getAvailableSecurityQuestionsApi } from "@/features/auth/api/auth.api";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { SettingsTextInput } from "@/features/settings";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { uiLog } from "@/features/shared/utils/logger";
import { isAxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, HelperText, useTheme } from "react-native-paper";
import { Dropdown } from "react-native-paper-dropdown";

const CUSTOM_VALUE = "__custom__";

export default function SecurityQuestion() {
  const theme = useTheme();
  const { setupQABlob } = useRecoveryKeySetup();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [errors, setErrors] = useState<{
    password?: string;
    question?: string;
    customQuestion?: string;
    answer?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<{ label: string; value: string }[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<"loading" | "success" | "error">("loading");
  const [overlayMessage, setOverlayMessage] = useState("");

  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    uiLog.info("[SecurityQuestion] mounted");
    getAvailableSecurityQuestionsApi()
      .then((list) => {
        const options = list.map((q) => ({ label: q, value: q }));
        options.push({ label: "Custom…", value: CUSTOM_VALUE });
        setQuestions(options);
      })
      .catch(() => {
        setQuestions([{ label: "Custom…", value: CUSTOM_VALUE }]);
      })
      .finally(() => setQuestionsLoading(false));

    return () => {
      uiLog.info("[SecurityQuestion] unmounted");
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  const effectiveQuestion =
    selectedQuestion === CUSTOM_VALUE ? customQuestion.trim() : selectedQuestion;

  const handleSave = async () => {
    uiLog.debug("[SecurityQuestion] handleSave called");
    const nextErrors = {
      password: password.trim() ? undefined : "Current password is required",
      question: selectedQuestion ? undefined : "Please select a security question",
      customQuestion:
        selectedQuestion === CUSTOM_VALUE && !customQuestion.trim()
          ? "Please enter your custom question"
          : undefined,
      answer: answer.trim() ? undefined : "Answer is required",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    try {
      setIsSaving(true);
      setOverlayStatus("loading");
      setOverlayVisible(true);
      await addSecurityQuestionApi(
        [{ question: effectiveQuestion, answer: answer.trim() }],
        password
      );
      try {
        await setupQABlob(effectiveQuestion, answer.trim());
      } catch {
        setOverlayStatus("error");
        setOverlayMessage(
          "Security question saved to server but could not be stored locally. You may need to set it up again on this device."
        );
        return;
      }
      setOverlayStatus("success");
      setOverlayMessage("Security question updated successfully");
    } catch (error) {
      uiLog.error("[SecurityQuestion] Error updating security question", { error });
      setOverlayVisible(false);
      if (isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        setErrors((prev) => ({ ...prev, password: "Incorrect password." }));
      } else {
        setOverlayStatus("error");
        setOverlayMessage("Failed to update security question. Please try again.");
        setOverlayVisible(true);
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
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              secureTextEntry={!showPassword}
              icon={showPassword ? "eye-off" : "eye"}
              onIconPress={() => setShowPassword((prev) => !prev)}
              error={Boolean(errors.password)}
            />
            <HelperText type="error" visible={Boolean(errors.password)}>
              {errors.password}
            </HelperText>
          </View>
          <Dropdown
            label="New Security Question"
            options={questions}
            value={selectedQuestion}
            onSelect={(value) => {
              setSelectedQuestion(value ?? "");
              if (errors.question) setErrors((prev) => ({ ...prev, question: undefined }));
            }}
            placeholder={questionsLoading ? "Loading questions…" : "Select question"}
            error={!!errors.question}
          />
          <HelperText type="error" visible={Boolean(errors.question)}>
            {errors.question}
          </HelperText>
          {selectedQuestion === CUSTOM_VALUE && (
            <View>
              <SettingsTextInput
                placeholder="Type your own question"
                label="Custom Question"
                value={customQuestion}
                onChangeText={(value) => {
                  setCustomQuestion(value);
                  if (errors.customQuestion)
                    setErrors((prev) => ({ ...prev, customQuestion: undefined }));
                }}
                error={Boolean(errors.customQuestion)}
              />
              <HelperText type="error" visible={Boolean(errors.customQuestion)}>
                {errors.customQuestion}
              </HelperText>
            </View>
          )}
          <View>
            <SettingsTextInput
              placeholder="Answer"
              label="Answer"
              value={answer}
              onChangeText={(value) => {
                setAnswer(value);
                if (errors.answer) setErrors((prev) => ({ ...prev, answer: undefined }));
              }}
              error={Boolean(errors.answer)}
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
          disabled={isSaving || questionsLoading}
        >
          Save
        </Button>
      </View>
      <LoadingOverlay
        visible={overlayVisible}
        status={overlayStatus}
        statusMessage={overlayMessage}
        onDismiss={() => {
          setOverlayVisible(false);
          if (overlayStatus === "success") {
            setPassword("");
            setSelectedQuestion("");
            setCustomQuestion("");
            setAnswer("");
            setErrors({});
            backTimerRef.current = setTimeout(() => router.back(), 100);
          }
        }}
      />
    </View>
  );
}
