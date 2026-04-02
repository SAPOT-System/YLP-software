import { SETTINGS_ROUTES } from "@/app/routes";
import { useUserService } from "@/features/auth";
import { validateRegistrationForm } from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import { Peer, updateProfileApi } from "@/features/shared";
import { useUserProfile } from "@/features/shared/hooks";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Avatar, Button, HelperText, Text, useTheme } from "react-native-paper";

export default function ManageProfile() {
  const theme = useTheme();
  const { user } = useUserProfile();
  const userService = useUserService();
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
  const [errors, setErrors] = useState<{
    username?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    email?: string;
  }>({});

  useFocusEffect(
    useCallback(() => {
      return () => {
        setUsername(user.username ?? "");
        setFirstName(user.firstName ?? "");
        setLastName(user.lastName ?? "");
        setPhoneNumber((user instanceof Peer ? user.phoneNumber : "") ?? "");
        setEmail((user instanceof Peer ? user.email : "") ?? "");
        setEditableField(null);
        setErrors({});
      };
    }, [user])
  );

  const normalizeValue = (value?: string) => (value ?? "").trim();
  const hasChanges =
    normalizeValue(username) !== normalizeValue(user.username) ||
    normalizeValue(firstName) !== normalizeValue(user.firstName) ||
    normalizeValue(lastName) !== normalizeValue(user.lastName);

  const handleSave = async () => {
    if (!hasChanges) {
      return;
    }

    const validationErrors = validateRegistrationForm({
      username,
      firstName,
      lastName,
    });

    setErrors({
      username: validationErrors.username,
      firstName: validationErrors.firstName,
      lastName: validationErrors.lastName,
      phoneNumber: validationErrors.phoneNumber,
      email: validationErrors.email,
    });

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    await updateProfileApi({
      username: normalizeValue(username),
      firstName: normalizeValue(firstName),
      lastName: normalizeValue(lastName),
    });

    await userService.updateAuthenticatedUser({
      username: normalizeValue(username),
      firstName: normalizeValue(firstName),
      lastName: normalizeValue(lastName),
    });

    setEditableField(null);
  };

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
            <View style={{ alignItems: "stretch", width: "100%", gap: 4 }}>
              <View>
                <SettingsTextInput
                  placeholder="Username"
                  label="Username"
                  value={username}
                  disabled={editableField !== "username"}
                  onChangeText={(text) => {
                    setUsername(text);
                    if (errors.username) {
                      setErrors((prev) => ({ ...prev, username: undefined }));
                    }
                  }}
                  icon="pencil"
                  onIconPress={() => setEditableField("username")}
                  error={Boolean(errors.username)}
                />
                <HelperText type="error" visible={Boolean(errors.username)}>
                  {errors.username}
                </HelperText>
              </View>
              <View>
                <SettingsTextInput
                  placeholder="First Name"
                  label="First Name"
                  value={firstName}
                  disabled={editableField !== "firstName"}
                  onChangeText={(text) => {
                    setFirstName(text);
                    if (errors.firstName) {
                      setErrors((prev) => ({ ...prev, firstName: undefined }));
                    }
                  }}
                  icon="pencil"
                  onIconPress={() => setEditableField("firstName")}
                  error={Boolean(errors.firstName)}
                />
                <HelperText type="error" visible={Boolean(errors.firstName)}>
                  {errors.firstName}
                </HelperText>
              </View>
              <View>
                <SettingsTextInput
                  placeholder="Last Name"
                  label="Last Name"
                  value={lastName}
                  disabled={editableField !== "lastName"}
                  onChangeText={(text) => {
                    setLastName(text);
                    if (errors.lastName) {
                      setErrors((prev) => ({ ...prev, lastName: undefined }));
                    }
                  }}
                  icon="pencil"
                  onIconPress={() => setEditableField("lastName")}
                  error={Boolean(errors.lastName)}
                />
                <HelperText type="error" visible={Boolean(errors.lastName)}>
                  {errors.lastName}
                </HelperText>
              </View>
              <View style={{ marginBottom: 20 }}>
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
              </View>
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
            <Button
              mode="contained"
              style={{ width: 164 }}
              onPress={handleSave}
              disabled={!hasChanges}
            >
              Save
            </Button>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
