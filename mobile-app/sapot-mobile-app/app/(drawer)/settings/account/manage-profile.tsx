import { SETTINGS_ROUTES } from "@/app/routes";
import { useUserService } from "@/features/auth";
import { validateRegistrationForm } from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import {
    ExpoFileUpload,
    Peer,
    updateProfileApi,
    uploadProfilePicApi,
} from "@/features/shared";
import { useProfilePhoto, useUserProfile } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import {
    ActivityIndicator,
    Avatar,
    Button,
    HelperText,
    Modal,
    Portal,
    Text,
    useTheme,
} from "react-native-paper";

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
  const {
    url: profilePicUrl,
    loading: isProfilePicLoading,
    setUrl: setProfilePicUrl,
  } = useProfilePhoto();
  const [isProfilePicUploading, setIsProfilePicUploading] = useState(false);
  const [isPhotoOptionsVisible, setIsPhotoOptionsVisible] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const actionColor = theme.dark ? "#ffffff" : "#000000";
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

  useEffect(() => {
    uiLog.info("[ManageProfile] mounted");
    return () => {
      uiLog.info("[ManageProfile] unmounted");
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      uiLog.debug("[ManageProfile] useFocusEffect triggered");
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
    uiLog.debug("[ManageProfile] handleSave called", {
      hasChanges,
    });
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
      uiLog.warn("[ManageProfile] validation failed");
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
    uiLog.info("[ManageProfile] profile updated");
  };

  const uploadProfilePhotoAsset = async (
    asset: ImagePicker.ImagePickerAsset
  ) => {
    uiLog.debug("[ManageProfile] uploadProfilePhotoAsset called");
    if (!asset?.uri) return;

    const file: ExpoFileUpload = {
      uri: asset.uri,
      name: asset.fileName ?? "profile.jpg",
      type: asset.mimeType ?? "image/jpeg",
    };

    setIsProfilePicUploading(true);
    const res = await uploadProfilePicApi(file);
    setProfilePicUrl(res.data?.url ?? null);
  };

  const handleUploadFromLibrary = async () => {
    uiLog.debug("[ManageProfile] handleUploadFromLibrary called");
    if (isProfilePicUploading) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;
      await uploadProfilePhotoAsset(result.assets[0]);
    } catch (error) {
      uiLog.error("profile › upload from library failed", { error });
    } finally {
      setIsProfilePicUploading(false);
      setIsPhotoOptionsVisible(false);
    }
  };

  const handleTakePhoto = async () => {
    uiLog.debug("[ManageProfile] handleTakePhoto called");
    if (isProfilePicUploading) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;
      await uploadProfilePhotoAsset(result.assets[0]);
    } catch (error) {
      uiLog.error("profile › capture failed", { error });
    } finally {
      setIsProfilePicUploading(false);
      setIsPhotoOptionsVisible(false);
    }
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
            {isProfilePicLoading ? (
              <ActivityIndicator />
            ) : (
              <View style={{ alignItems: "center" }}>
                {profilePicUrl ? (
                  <Avatar.Image size={100} source={{ uri: profilePicUrl }} />
                ) : (
                  <Avatar.Text
                    size={100}
                    label={(user.username[0] ?? "?").toUpperCase()}
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                )}
                <Pressable
                  onPress={() => {
                    uiLog.debug("[ManageProfile] onPress triggered");
                    setIsPhotoOptionsVisible(true);
                  }}
                  disabled={isProfilePicUploading}
                >
                  <Text style={{ color: "#3A7AFE" }}>Change Photo</Text>
                </Pressable>
              </View>
            )}
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
                  onIconPress={() => {
                    uiLog.debug("[ManageProfile] onIconPress triggered");
                    setEditableField("username");
                  }}
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
                  onIconPress={() => {
                    uiLog.debug("[ManageProfile] onIconPress triggered");
                    setEditableField("firstName");
                  }}
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
                  onIconPress={() => {
                    uiLog.debug("[ManageProfile] onIconPress triggered");
                    setEditableField("lastName");
                  }}
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
                checkIcon={user instanceof Peer && user.emailVerified === true}
                labelRight={
                  user instanceof Peer &&
                  user.emailVerified === false && (
                    <Pressable
                      onPress={() => {
                        uiLog.info("[Navigation] Navigating to VerifyEmail", {
                          screen: SETTINGS_ROUTES.VERIFY_EMAIL,
                        });
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
                  )
                }
                onIconPress={() => {
                  uiLog.info("[Navigation] Navigating to UpdateEmail", {
                    screen: SETTINGS_ROUTES.UPDATE_EMAIL,
                  });
                  router.push(SETTINGS_ROUTES.UPDATE_EMAIL);
                }}
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
      <Portal>
        <Modal
          visible={isPhotoOptionsVisible}
          onDismiss={() => setIsPhotoOptionsVisible(false)}
          contentContainerStyle={{
            backgroundColor: theme.colors.background,
            padding: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
          style={{ justifyContent: "flex-end" }}
        >
          <Button
            icon={"camera-outline"}
            onPress={handleTakePhoto}
            loading={isProfilePicUploading}
            textColor={actionColor}
            style={{ alignSelf: "stretch" }}
            contentStyle={{
              justifyContent: "flex-start",
              paddingHorizontal: 26,
              paddingVertical: 14,
            }}
            labelStyle={{ fontSize: 17 }}
          >
            Take Photo
          </Button>
          <Button
            icon={"folder-multiple-image"}
            onPress={handleUploadFromLibrary}
            loading={isProfilePicUploading}
            textColor={actionColor}
            style={{ alignSelf: "stretch" }}
            contentStyle={{
              justifyContent: "flex-start",
              paddingHorizontal: 26,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#D9D9D9",
            }}
            labelStyle={{ fontSize: 17 }}
          >
            Upload Photo
          </Button>
          <Button
            icon={"eye-outline"}
            onPress={() => {
              if (profilePicUrl) {
                setIsPhotoViewerVisible(true);
                setIsPhotoOptionsVisible(false);
              }
            }}
            disabled={!profilePicUrl}
            textColor={actionColor}
            style={{ alignSelf: "stretch" }}
            contentStyle={{
              justifyContent: "flex-start",
              paddingHorizontal: 26,
              paddingVertical: 14,
            }}
            labelStyle={{ fontSize: 17 }}
          >
            View Photo
          </Button>
        </Modal>
        <Modal
          visible={isPhotoViewerVisible}
          onDismiss={() => setIsPhotoViewerVisible(false)}
          contentContainerStyle={{
            flex: 1,
            margin: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              justifyContent: "center",
              alignItems: "center",
              padding: 16,
              alignSelf: "stretch",
            }}
            onPress={() => setIsPhotoViewerVisible(false)}
          >
            {profilePicUrl && (
              <Image
                source={{ uri: profilePicUrl }}
                style={{ width: "100%", height: "70%", borderRadius: 12 }}
                resizeMode="contain"
              />
            )}
          </Pressable>
        </Modal>
      </Portal>
    </View>
  );
}
