import { AUTH_ROUTES } from "@/app/routes";
import { PrimaryButton } from "@/features/auth";
import { authLog } from "@/features/shared/utils/logger";
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Icon, Text, useTheme } from "react-native-paper";

const SuccessScreen = () => {
  const theme = useTheme();

  useEffect(() => {
    authLog.info("[SuccessScreen] mounted");
    return () => {
      authLog.info("[SuccessScreen] unmounted");
    };
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 8,
      }}
    >
      <Icon
        source="checkbox-marked-circle"
        size={200}
        color={theme.colors.primary}
      />
      <View
        style={{ marginTop: 32, gap: 24, alignItems: "center", width: "100%" }}
      >
        <Text
          variant="headlineLarge"
          style={{ fontWeight: "bold", color: theme.colors.inverseOnSurface }}
        >
          Success!
        </Text>
        <Text style={{ textAlign: "center" }}>
          Your password has been successfully changed. Make sure to remember the
          new password.
        </Text>
        <PrimaryButton
          style={{ width: "100%" }}
          onPress={() => {
            authLog.info("[Navigation] Navigating to ServerLogin", {
              screen: AUTH_ROUTES.LOGIN.SERVER_LOGIN,
            });
            router.replace(AUTH_ROUTES.LOGIN.SERVER_LOGIN);
          }}
        >
          Login
        </PrimaryButton>
      </View>
    </View>
  );
};
export default SuccessScreen;
