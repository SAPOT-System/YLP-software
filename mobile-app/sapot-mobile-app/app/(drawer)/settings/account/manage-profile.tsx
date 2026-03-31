import { SETTINGS_ROUTES } from "@/app/routes";
import { SettingsTextInput } from "@/features/settings";
import { Peer } from "@/features/shared";
import { useUserProfile } from "@/features/shared/hooks";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Avatar, Button, Text, useTheme } from "react-native-paper";

export default function ManageProfile() {
  const theme = useTheme();
  const { user } = useUserProfile();
  const [username, setUsername] = useState(user.username ?? "");
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(
    (user instanceof Peer ? user.phoneNumber : "") ?? ""
  );
  const [email, setEmail] = useState(
    (user instanceof Peer ? user.email : "") ?? ""
  );
  const [editableField, setEditableField] = useState<
    "username" | "firstName" | "lastName" | "phoneNumber" | "email" | null
  >(null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={120}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 32 }}
        >
          <View style={{ alignItems: "center", gap: 28 }}>
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
                disabled={editableField !== "username"}
                onChangeText={setUsername}
                icon="pencil"
                onIconPress={() => setEditableField("username")}
              />
              <SettingsTextInput
                placeholder="First Name"
                label="First Name"
                value={firstName}
                disabled={editableField !== "firstName"}
                onChangeText={setFirstName}
                icon="pencil"
                onIconPress={() => setEditableField("firstName")}
              />
              <SettingsTextInput
                placeholder="Last Name"
                label="Last Name"
                value={lastName}
                disabled={editableField !== "lastName"}
                onChangeText={setLastName}
                icon="pencil"
                onIconPress={() => setEditableField("lastName")}
              />
              <SettingsTextInput
                disabled={true}
                placeholder="Phone Number"
                label="Phone Number"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                icon="pencil"
                labelRight={
                  <Pressable>
                    <Text
                      style={{
                        color: "#3A7AFE",
                        fontWeight: "semibold",
                        textDecorationLine: "underline",
                        textDecorationColor: "#3A7AFE",
                      }}
                    >
                      Verify
                    </Text>
                  </Pressable>
                }
              />
              <SettingsTextInput
                placeholder="Email Address"
                label="Email Address"
                disabled={true}
                value={email}
                onChangeText={setEmail}
                icon="pencil"
                labelRight={
                  <Pressable
                    onPress={() => {
                      router.push({
                        pathname: SETTINGS_ROUTES.VERIFY_EMAIL,
                        params: {
                          email: user instanceof Peer ? user.email : "",
                        },
                      });
                    }}
                  >
                    <Text
                      style={{
                        color: "#3A7AFE",
                        fontWeight: "semibold",
                        textDecorationLine: "underline",
                        textDecorationColor: "#3A7AFE",
                      }}
                    >
                      Verify
                    </Text>
                  </Pressable>
                }
                onIconPress={() => router.push(SETTINGS_ROUTES.UPDATE_EMAIL)}
              />
            </View>
            <Button mode="contained" style={{ width: 164 }}>
              Save
            </Button>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
