import { Peer } from "@/features/shared";
import { useUserProfile } from "@/features/shared/hooks";
import { View } from "react-native";
import { Avatar, Text, useTheme } from "react-native-paper";

export default function Settings() {
  const theme = useTheme();
  const { user, isGuest } = useUserProfile();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.background,
            paddingHorizontal: 20,
            paddingVertical: 16,
            gap: 8,
          }}
        >
          <Avatar.Text
            size={60}
            label={user.username[0].toUpperCase()}
            style={{ backgroundColor: theme.colors.primary }}
          />
          <View style={{ flex: 1 }}>
            <Text
              variant="headlineSmall"
              style={{
                color: theme.colors.onPrimaryContainer,
                fontWeight: "bold",
              }}
            >
              {user.username}
            </Text>
            {!isGuest && user instanceof Peer && user.email && (
              <>
                <Text
                  variant="titleSmall"
                  style={{
                    color: theme.colors.onTertiary,
                    fontWeight: "semibold",
                  }}
                >
                  {user.email}
                </Text>
                <Text>Account ID</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
