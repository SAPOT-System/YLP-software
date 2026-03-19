import { SettingsTextInput } from "@/features/settings";
import { useUserProfile } from "@/features/shared/hooks";
import { useState } from "react";
import { View } from "react-native";
import { Avatar, Button, useTheme } from "react-native-paper";

export default function ManageProfile() {
  const theme = useTheme();
  const { user } = useUserProfile();
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16, alignItems: "center", gap: 28 }}>
        <Avatar.Text
          size={100}
          label={user.username[0].toUpperCase()}
          style={{ backgroundColor: theme.colors.primary }}
        />
        <View style={{ alignItems: "stretch", width: "100%", gap: 24 }}>
          <SettingsTextInput
            placeholder="Username"
            label="Username"
            value={username}
            onChangeText={setUsername}
            icon="pencil"
          />
          <SettingsTextInput
            placeholder="Phone Number"
            label="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            icon="pencil"
          />
          <SettingsTextInput
            placeholder="Email Address"
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            icon="pencil"
          />
        </View>
        <Button mode="contained" style={{ width: 164 }}>
          Save
        </Button>
      </View>
    </View>
  );
}
