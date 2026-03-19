import { SettingsTextInput } from "@/features/settings";
import { useState } from "react";
import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export default function ChangePassword() {
  const theme = useTheme();
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 24 }}>
        <View style={{ alignItems: "stretch", width: "100%", gap: 16 }}>
          <SettingsTextInput
            placeholder="Current Password"
            label="Current Password"
            value={currentPass}
            onChangeText={setCurrentPass}
          />
          <SettingsTextInput
            placeholder="New Password"
            label="New Password"
            value={newPass}
            onChangeText={setNewPass}
          />
          <SettingsTextInput
            placeholder="Confirm Password"
            label="Confirm Password"
            value={confirmPass}
            onChangeText={setConfirmPass}
          />
        </View>
        <Text
          variant="bodyMedium"
          style={{
            textDecorationLine: "underline",
            textAlign: "left",
            textDecorationColor: theme.colors.inverseOnSurface,
            color: theme.colors.inverseOnSurface,
          }}
        >
          Forgot password?
        </Text>
        <Button mode="contained" style={{ width: 164 }}>
          Save
        </Button>
      </View>
    </View>
  );
}
