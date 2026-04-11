import { useAppMode } from "@/features/shared/context";
import { uiLog } from "@/features/shared/utils/logger";
import { useEffect } from "react";
import { View } from "react-native";
import { Button, Icon, Text, useTheme } from "react-native-paper";

export default function Server() {
  const theme = useTheme();
  const { mode } = useAppMode();

  useEffect(() => {
    uiLog.info("[Server] mounted");
    return () => {
      uiLog.info("[Server] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[Server] useEffect triggered, deps:", { mode });
  }, [mode]);

  return (
    <View
      style={{
        flex: 1,
        padding: 28,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {mode === "auto" || mode === "server" ? (
        <>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "medium",
              marginBottom: 16,
              color: theme.colors.inverseOnSurface,
            }}
          >
            Server Status
          </Text>
          <View
            style={{
              borderRadius: 20,
              elevation: 6,
              padding: 40,
              backgroundColor: theme.dark ? "#121A2E" : "#F6F6F6",
              justifyContent: "center",
              alignItems: "center",
              gap: 30,
            }}
          >
            <View style={{ gap: 10 }}>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Icon
                  source="cloud-check-variant-outline"
                  color={theme.colors.inverseOnSurface}
                  size={50}
                />
                <Text
                  style={{ fontSize: 17, color: theme.colors.inverseOnSurface }}
                >
                  Connected
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Icon
                  source="shield-check-outline"
                  color={theme.colors.inverseOnSurface}
                  size={50}
                />
                <Text
                  style={{ fontSize: 17, color: theme.colors.inverseOnSurface }}
                >
                  Secure Connection
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Icon
                  source="lock-outline"
                  color={theme.colors.inverseOnSurface}
                  size={50}
                />
                <Text
                  style={{ fontSize: 17, color: theme.colors.inverseOnSurface }}
                >
                  End-to-end Encryption
                </Text>
              </View>
            </View>
            <Button mode="contained" style={{ width: 164, elevation: 6 }}>
              Cancel
            </Button>
          </View>
        </>
      ) : (
        <>
          <View
            style={{
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 20,
              padding: 20,
              backgroundColor: theme.dark ? "#121A2E" : "#F6F6F6",
              elevation: 6,
            }}
          >
            <Icon
              source="cloud-arrow-up-outline"
              size={55}
              color={theme.colors.inverseOnSurface}
            />
            <Text
              style={{
                fontSize: 32,
                marginTop: 8,
                fontWeight: "bold",
                color: theme.colors.inverseOnSurface,
              }}
            >
              Server Mode
            </Text>
            <Text
              style={{
                marginTop: 36,
                fontSize: 21,
                fontWeight: "semibold",
                color: theme.colors.inverseOnSurface,
                textAlign: "justify",
              }}
            >
              Message mode allows you to connect with other people throughout
              the server. This makes it easier to find peers nearby
            </Text>
            <Button
              mode="contained"
              style={{ width: 164, marginTop: 46, elevation: 6 }}
            >
              Connect
            </Button>
          </View>
          <Text
            style={{ fontSize: 13, color: theme.dark ? "#FFF" : "#6B7280" }}
          >
            Note: Connecting to server requires an account
          </Text>
        </>
      )}
    </View>
  );
}
