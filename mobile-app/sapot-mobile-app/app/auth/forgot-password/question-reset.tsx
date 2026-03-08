import { View } from "react-native";
import React, { useState } from "react";
import { ScreenContent, ScreenHeader } from "@/features/getting-started";
import {
  ActivityIndicator,
  Button,
  HelperText,
  TextInput,
} from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useGetQuestion, useVerifyAnswer } from "@/features/auth";
import { AUTH_ROUTES } from "@/app/routes";

const QuestionResetScreen = () => {
  const { identifier } = useLocalSearchParams<{ identifier: string }>();

  const getQuestionResult = useGetQuestion(identifier);

  if (!getQuestionResult) {
    return <ActivityIndicator />;
  }

  const { loading: gettingQuestionLoading, question } = getQuestionResult;

  const {
    loading: verifyAnswerLoading,
    error,
    verifyAnswer,
  } = useVerifyAnswer(identifier);

  const [answer, setAnswer] = useState("");

  if (gettingQuestionLoading) {
    return <ActivityIndicator />;
  }

  const handleVerify = async () => {
    const res = await verifyAnswer({ question, answer });

    if (res.success && res.resetLink) {
      const token = res.resetLink.split("token=")[1];

      router.push({
        pathname: AUTH_ROUTES.FORGOT_PASSWORD.RESET_PASSWORD,
        params: { token, identifier },
      });
    }
  };

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}
    >
      <ScreenHeader headerName="Resetting Password" />
      <ScreenContent
        title="Password Recovery"
        description="Please enter your account"
      >
        <View
          style={{ width: "100%", alignItems: "stretch", marginBottom: 40 }}
        >
          <HelperText type="error">{error.general}</HelperText>
          <TextInput
            mode="outlined"
            label={question}
            placeholder={question}
            value={answer}
            onChangeText={setAnswer}
            error={!!error.answer}
          />
          <HelperText type="error">{error.answer}</HelperText>
        </View>
        <Button
          mode="contained"
          style={{ width: 280 }}
          onPress={handleVerify}
          loading={verifyAnswerLoading}
          disabled={verifyAnswerLoading}
        >
          Verify
        </Button>
      </ScreenContent>
    </View>
  );
};

export default QuestionResetScreen;
