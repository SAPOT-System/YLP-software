import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Button, Text } from "react-native-paper";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const handleVerify = () => {};
  return (
    <View style={{ flex: 1, backgroundColor: "#FFF" }}>
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
            backgroundColor: "#EAEDF3",
            borderRadius: 10,
          }}
        >
          <Text
            style={{ fontWeight: "medium", textAlign: "center", fontSize: 17 }}
          >
            Verify with Email
          </Text>
          <Text style={{ fontSize: 17, textAlign: "center" }}>
            A 6-digit code will be sent to{" "}
          </Text>
          <Text
            style={{ fontWeight: "medium", fontSize: 17, textAlign: "center" }}
          >
            {email}
          </Text>
        </View>
        <Button mode="contained" style={{ width: 164 }} onPress={handleVerify}>
          Verify Email
        </Button>
      </View>
    </View>
  );
}
