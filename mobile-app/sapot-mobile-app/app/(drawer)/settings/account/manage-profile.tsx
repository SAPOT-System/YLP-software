import { SETTINGS_ROUTES } from "@/config/routes";
import { useUserService } from "@/features/auth";
import {
  toInternationalPhone,
  validateEmail,
} from "@/features/auth/utils/validation";
import { SettingsTextInput } from "@/features/settings";
import {
  ExpoFileUpload,
  getUserApi,
  updateProfileApi,
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
  const { user, isGuest } = useUserProfile();
  const userService = useUserService();
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
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
  const [phoneNumber, setPhoneNumber] = useState(currentPhoneNumber);
  const [email, setEmail] = useState(currentEmail);
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
  const [errors, setErrors] = useState<{
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
      (async () => {
        try {
          const fresh = await getUserApi();
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
        setErrors({});
        setPhoneNumber(currentPhoneNumber);
        setEmail(currentEmail);
        setIsPhotoOptionsVisible(false);
        setIsPhotoViewerVisible(false);
      };
    }, [currentEmail, currentPhoneNumber, userService])
  );

  useEffect(() => {
    setPhoneNumber(currentPhoneNumber);
    setEmail(currentEmail);
  }, [currentEmail, currentPhoneNumber]);

  const normalizeValue = (value?: string) => (value ?? "").trim();
  const emailHasChanged =
    normalizeValue(email) !== normalizeValue(currentEmail);
  const phoneHasChanged =
    normalizeValue(phoneNumber) !== normalizeValue(currentPhoneNumber);
  const hasChanges =
    !isGuest &&
    (normalizeValue(phoneNumber) !== normalizeValue(currentPhoneNumber) ||
      emailHasChanged);

  const handleSave = async () => {
    uiLog.debug("[ManageProfile] handleSave called", {
      hasChanges,
    });
    if (!hasChanges) {
      return;
    }
    if (isGuest) {
      return;
    }
    if (isServerOffline) {
      showError("Server unavailable. Cannot save profile.");
      return;
    }

    const nextErrors: { phoneNumber?: string; email?: string } = {};
    const normalizedPhoneNumber = normalizeValue(phoneNumber);
    const normalizedEmail = normalizeValue(email);

    if (
      normalizedPhoneNumber.length > 0 &&
      !/^09\d{9}$/.test(normalizedPhoneNumber)
    ) {
      nextErrors.phoneNumber = "Phone number must be in the format 09XXXXXXXXX";
    }

    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      nextErrors.email = emailError;
    }

    setErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      uiLog.warn("[ManageProfile] validation failed");
      return;
    }

    try {
      await updateProfileApi({
        phoneNumber:
          normalizedPhoneNumber === ""
            ? undefined
            : toInternationalPhone(normalizedPhoneNumber),
        email: normalizedEmail === "" ? undefined : normalizedEmail,
      });

      const fresh = await getUserApi();
      await userService.updateAuthenticatedUser({
        phoneNumber: fresh.phone_number || undefined,
        email: fresh.email || undefined,
        emailVerified: fresh.email_verified,
        phoneNumberVerified: fresh.phone_number_verified,
      });

      setPhoneNumber(normalizedPhoneNumber);
      setEmail(normalizedEmail);
      setErrors({});
      uiLog.info("[ManageProfile] profile updated");
      showToast("Profile updated");
    } catch (error) {
      uiLog.error("[ManageProfile] profile update failed", { error });
      showError("Failed to update profile. Please try again.");
    }
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
      showToast("Server unavailable. Cannot upload photo.");
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
      showToast("Server unavailable. Cannot upload photo.");
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
                <View style={{ marginBottom: 4 }}>
                  <SettingsTextInput
                    placeholder="Phone Number"
                    label="Phone Number"
                    value={phoneNumber}
                    onChangeText={(text) => {
                      setPhoneNumber(text);
                      if (errors.phoneNumber) {
                        setErrors((prev) => ({
                          ...prev,
                          phoneNumber: undefined,
                        }));
                      }
                    }}
                    error={Boolean(errors.phoneNumber)}
                    checkIcon={currentPhoneNumberVerified && !phoneHasChanged}
                    labelRight={
                      !phoneHasChanged && !currentPhoneNumberVerified ? (
                        <Pressable
                          onPress={() => {
                            uiLog.info(
                              "[Navigation] Navigating to VerifyPhone",
                              {
                                screen: SETTINGS_ROUTES.VERIFY_PHONE,
                              }
                            );
                            router.push({
                              pathname: SETTINGS_ROUTES.VERIFY_PHONE,
                              params: {
                                phone: normalizeValue(phoneNumber),
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
                      ) : undefined
                    }
                  />
                  <HelperText
                    type="error"
                    visible={Boolean(errors.phoneNumber)}
                  >
                    {errors.phoneNumber}
                  </HelperText>
                </View>
              )}
              {!isGuest && (
                <View style={{ marginBottom: 4 }}>
                  <SettingsTextInput
                    placeholder="Email Address"
                    label="Email Address"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (errors.email) {
                        setErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    error={Boolean(errors.email)}
                    checkIcon={currentEmailVerified && !emailHasChanged}
                    labelRight={
                      !emailHasChanged && !currentEmailVerified ? (
                        <Pressable
                          onPress={() => {
                            uiLog.info(
                              "[Navigation] Navigating to VerifyEmail",
                              {
                                screen: SETTINGS_ROUTES.VERIFY_EMAIL,
                              }
                            );
                            router.push({
                              pathname: SETTINGS_ROUTES.VERIFY_EMAIL,
                              params: {
                                email: normalizeValue(email),
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
                      ) : undefined
                    }
                  />
                  <HelperText type="error" visible={Boolean(errors.email)}>
                    {errors.email}
                  </HelperText>
                </View>
              )}
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
