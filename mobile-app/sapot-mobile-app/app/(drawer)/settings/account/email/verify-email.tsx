import VerificationCodeModal from "@/features/settings/components/verification-code-modal";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const theme = useTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const handleVerify = () => {
    setIsModalVisible(true);
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.dark ? "#0B1020" : "#FFF" }}>
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 30,
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            paddingHorizontal: 40,
            paddingVertical: 46,
            backgroundColor: theme.dark ? "#1A233A" : "#EAEDF3",
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              fontWeight: "medium",
              textAlign: "center",
              fontSize: 17,
              color: theme.dark ? "#E6ECF5" : "#000000",
            }}
          >
            Verify with Email
          </Text>
          <Text
            style={{
              fontSize: 17,
              textAlign: "center",
              color: theme.dark ? "#E6ECF5" : "#000000",
            }}
          >
            A 6-digit code will be sent to{" "}
          </Text>
          <Text
            style={{
              fontWeight: "medium",
              fontSize: 17,
              textAlign: "center",
              color: theme.dark ? "#3A7AFE" : "#103462",
            }}
          >
            {email}
          </Text>
        </View>
        <Button mode="contained" style={{ width: 164 }} onPress={handleVerify}>
          Verify Email
        </Button>
      </View>
      <VerificationCodeModal
        visible={isModalVisible}
        email={email}
        onDismiss={() => setIsModalVisible(false)}
        onVerifyCode={() => {}}
        onResendCode={() => {}}
      />
    </View>
  );
}
