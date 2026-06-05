import { SETTINGS_ROUTES } from "@/config/routes";
import { useUserService } from "@/features/auth";
import { SettingsTextInput } from "@/features/settings";
import {
  ExpoFileUpload,
  getUserApi,
  uploadProfilePicApi,
} from "@/features/shared";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import {
  useProfilePhoto,
  useServerAction,
  useToast,
  useUserProfile,
} from "@/features/shared/hooks";
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
  Avatar,
  Button,
  Modal,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";

export default function ManageProfile() {
  const theme = useTheme();
  const { user, isGuest } = useUserProfile();
  const userService = useUserService();
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showError,
    hideToast,
  } = useToast();
  const currentPhoneNumber = isGuest
    ? ""
    : (user as { phoneNumber?: string }).phoneNumber ?? "";
  const currentEmail = isGuest ? "" : (user as { email?: string }).email ?? "";
  const currentEmailVerified = isGuest
    ? false
    : Boolean((user as { emailVerified?: boolean }).emailVerified);
  const currentPhoneNumberVerified = isGuest
    ? false
    : Boolean((user as { phoneNumberVerified?: boolean }).phoneNumberVerified);
  const {
    url: profilePicUrl,
    loading: isProfilePicLoading,
    setUrl: setProfilePicUrl,
  } = useProfilePhoto();
  const { isServerOffline } = useServerAction();
  const [isProfilePicUploading, setIsProfilePicUploading] = useState(false);
  const [isPhotoOptionsVisible, setIsPhotoOptionsVisible] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const actionColor = theme.dark ? "#ffffff" : "#000000";

  useEffect(() => {
    uiLog.info("[ManageProfile] mounted");
    return () => {
      uiLog.info("[ManageProfile] unmounted");
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      uiLog.debug("[ManageProfile] useFocusEffect triggered");
      (async () => {
        try {
          const fresh = await getUserApi();
          if (!active) return;
          await userService.updateAuthenticatedUser({
            email: fresh.email || undefined,
            phoneNumber: fresh.phone_number || undefined,
            emailVerified: fresh.email_verified,
            phoneNumberVerified: fresh.phone_number_verified,
          });
        } catch {
          // silent — store retains last-known state
        }
      })();
      return () => {
        active = false;
        setIsPhotoOptionsVisible(false);
        setIsPhotoViewerVisible(false);
      };
    }, [userService])
  );

  if (!user) return <LoadingSpinner />;

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
    try {
      const res = await uploadProfilePicApi(file);
      setProfilePicUrl(res.data?.url ?? null);
    } catch (error) {
      uiLog.error("[ManageProfile] upload profile photo failed", { error });
      showError("Failed to upload profile photo.");
    } finally {
      setIsProfilePicUploading(false);
    }
  };

  const handleUploadFromLibrary = async () => {
    uiLog.debug("[ManageProfile] handleUploadFromLibrary called");
    if (isGuest) return;
    if (isProfilePicUploading) return;
    if (isServerOffline) {
      showError("Server unavailable. Cannot upload photo.");
      setIsPhotoOptionsVisible(false);
      return;
    }

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
    if (isGuest) return;
    if (isProfilePicUploading) return;
    if (isServerOffline) {
      showError("Server unavailable. Cannot upload photo.");
      setIsPhotoOptionsVisible(false);
      return;
    }

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
            {isProfilePicLoading && !isGuest ? (
              <LoadingSpinner />
            ) : (
              <View style={{ alignItems: "center" }}>
                {profilePicUrl ? (
                  <Avatar.Image size={100} source={{ uri: profilePicUrl }} />
                ) : (
                  <Avatar.Text
                    size={100}
                    label={(user.username?.[0]?.toUpperCase()) ?? "?"}
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                )}
                {!isGuest && (
                  <Pressable
                    onPress={() => {
                      uiLog.debug("[ManageProfile] onPress triggered");
                      setIsPhotoOptionsVisible(true);
                    }}
                    disabled={isProfilePicUploading}
                  >
                    <Text style={{ color: "#3A7AFE" }}>Change Photo</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View style={{ alignItems: "stretch", width: "100%", gap: 4 }}>
              <View>
                <SettingsTextInput
                  placeholder="Username"
                  label="Username"
                  value={user.username ?? ""}
                  disabled={true}
                  onChangeText={() => {}}
                />
              </View>
              <View>
                <SettingsTextInput
                  placeholder="First Name"
                  label="First Name"
                  value={user.firstName ?? ""}
                  disabled={true}
                  onChangeText={() => {}}
                />
              </View>
              <View>
                <SettingsTextInput
                  placeholder="Last Name"
                  label="Last Name"
                  value={user.lastName ?? ""}
                  disabled={true}
                  onChangeText={() => {}}
                />
              </View>

              {!isGuest && (
                <View style={{ marginBottom: 8 }}>
                  <SettingsTextInput
                    placeholder="Phone Number"
                    label="Phone Number"
                    value={currentPhoneNumber}
                    disabled={true}
                    onChangeText={() => {}}
                    labelRight={
                      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                        {currentPhoneNumber.length > 0 && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: currentPhoneNumberVerified ? "#15803D" : "#854D0E",
                            }}
                          >
                            {currentPhoneNumberVerified ? "✓ Verified" : "Not verified"}
                          </Text>
                        )}
                        {currentPhoneNumber.length > 0 && !currentPhoneNumberVerified && (
                          <Pressable
                            onPress={() =>
                              router.push({
                                pathname: SETTINGS_ROUTES.VERIFY_PHONE,
                                params: { phone: currentPhoneNumber },
                              })
                            }
                          >
                            <Text style={{ color: "#3A7AFE", fontSize: 12 }}>Verify</Text>
                          </Pressable>
                        )}
                        <Pressable onPress={() => router.push(SETTINGS_ROUTES.EDIT_PHONE)}>
                          <Text style={{ color: "#3A7AFE", fontSize: 12 }}>
                            {currentPhoneNumber.length > 0 ? "Change" : "Add"}
                          </Text>
                        </Pressable>
                      </View>
                    }
                  />
                </View>
              )}

              {!isGuest && (
                <View style={{ marginBottom: 8 }}>
                  <SettingsTextInput
                    placeholder="Email Address"
                    label="Email Address"
                    value={currentEmail}
                    disabled={true}
                    onChangeText={() => {}}
                    labelRight={
                      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                        {currentEmail.length > 0 && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: currentEmailVerified ? "#15803D" : "#854D0E",
                            }}
                          >
                            {currentEmailVerified ? "✓ Verified" : "Not verified"}
                          </Text>
                        )}
                        {currentEmail.length > 0 && !currentEmailVerified && (
                          <Pressable
                            onPress={() =>
                              router.push({
                                pathname: SETTINGS_ROUTES.VERIFY_EMAIL,
                                params: { email: currentEmail },
                              })
                            }
                          >
                            <Text style={{ color: "#3A7AFE", fontSize: 12 }}>Verify</Text>
                          </Pressable>
                        )}
                        <Pressable onPress={() => router.push(SETTINGS_ROUTES.UPDATE_EMAIL)}>
                          <Text style={{ color: "#3A7AFE", fontSize: 12 }}>
                            {currentEmail.length > 0 ? "Change" : "Add"}
                          </Text>
                        </Pressable>
                      </View>
                    }
                  />
                </View>
              )}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
      <AppSnackbar
        visible={toastVisible}
        onDismiss={hideToast}
        variant={toastVariant}
      >
        {toastMessage}
      </AppSnackbar>
      {!isGuest && (
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
      )}
    </View>
  );
}
