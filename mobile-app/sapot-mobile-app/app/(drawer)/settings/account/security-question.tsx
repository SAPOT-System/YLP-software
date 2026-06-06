import { addSecurityQuestionApi, getAvailableSecurityQuestionsApi } from "@/features/auth/api/auth.api";
import { useRecoveryKeySetup } from "@/features/auth/hooks/use-recovery-key-setup";
import { useRecoveryConstraints } from "@/features/auth/hooks/use-recovery-constraints";
import { SettingsTextInput } from "@/features/settings";
import LoadingOverlay from "@/features/shared/components/loading-overlay";
import { uiLog } from "@/features/shared/utils/logger";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, HelperText, Text, useTheme } from "react-native-paper";
import { Dropdown } from "react-native-paper-dropdown";

const CUSTOM_VALUE = "__custom__";

export default function SecurityQuestion() {
  const theme = useTheme();
  const { setupQABlob } = useRecoveryKeySetup();
  const { data: constraints, isLoading: constraintsLoading } = useRecoveryConstraints();

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

  const { data: fetchedQuestions, isLoading: questionsLoading } = useQuery({
    queryKey: ["security-questions"],
    queryFn: getAvailableSecurityQuestionsApi,
    staleTime: Infinity,
    gcTime: Infinity,
    select: (list) => [
      { label: "Custom…", value: CUSTOM_VALUE },
      ...list.map((q) => ({ label: q, value: q })),
    ],
  });

  const questions = fetchedQuestions ?? [{ label: "Custom…", value: CUSTOM_VALUE }];

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<"loading" | "success" | "error">("loading");
  const [overlayMessage, setOverlayMessage] = useState("");

  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    uiLog.info("[SecurityQuestion] mounted");
    return () => {
      uiLog.info("[SecurityQuestion] unmounted");
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  const sqConstraint = constraints?.security_question;
  const inCooldown = sqConstraint != null && !sqConstraint.can_change;

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
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          setErrors((prev) => ({ ...prev, password: "Incorrect password." }));
        } else if (status === 429) {
          const detail = error.response?.data?.detail;
          const days = typeof detail === "object" ? detail?.days_remaining : null;
          setErrors((prev) => ({
            ...prev,
            question: days != null
              ? `Cooldown active — try again in ${days} day${days === 1 ? "" : "s"}.`
              : "Security question cannot be changed yet.",
          }));
        } else {
          setOverlayStatus("error");
          setOverlayMessage("Failed to update security question. Please try again.");
          setOverlayVisible(true);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 24 }}>
        {inCooldown && sqConstraint?.days_until_changeable != null && (
          <View
            style={{
              backgroundColor: theme.colors.errorContainer,
              borderRadius: 4,
              padding: 12,
              width: "100%",
            }}
          >
            <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
              Security question is in a cooldown period. You can change it in{" "}
              <Text variant="labelSmall" style={{ fontWeight: "700" }}>
                {sqConstraint.days_until_changeable} day{sqConstraint.days_until_changeable === 1 ? "" : "s"}
              </Text>.
            </Text>
          </View>
        )}
        {sqConstraint?.is_expired && (
          <View
            style={{
              backgroundColor: theme.colors.tertiaryContainer,
              borderRadius: 4,
              padding: 12,
              width: "100%",
            }}
          >
            <Text variant="bodySmall" style={{ color: theme.colors.onTertiaryContainer }}>
              Your security question has expired. Please set a new one.
            </Text>
          </View>
        )}
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
              editable={!inCooldown}
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
            disabled={inCooldown}
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
                editable={!inCooldown}
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
              editable={!inCooldown}
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
          loading={isSaving || constraintsLoading}
          disabled={isSaving || questionsLoading || constraintsLoading || inCooldown}
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
