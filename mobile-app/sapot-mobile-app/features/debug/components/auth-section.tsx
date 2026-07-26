import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useToast } from "@/features/shared/hooks";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, Divider, IconButton, Text, useTheme } from "react-native-paper";
import { useDebugAuth } from "../hooks/use-debug-auth";
import {
  DebugUserRole,
  FIXTURE_HANDLES,
  FixtureHandle,
} from "../services/debug-auth-service";

interface AuthSectionProps {
  onBack: () => void;
}

export function AuthSection({ onBack }: AuthSectionProps) {
  const theme = useTheme();
  const {
    snapshot,
    loading,
    seedTestUser,
    loginAs,
    seedLanUser,
    setRole,
    injectFakeAccessToken,
    clearAccessToken,
    forceLogout,
    resetAuthState,
  } = useDebugAuth();
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
    showError,
    hideToast,
  } = useToast();

  const runAction = async (
    action: () => Promise<void>,
    successMessage: string,
    failureMessage: string
  ) => {
    try {
      await action();
      showToast(successMessage);
    } catch {
      showError(failureMessage);
    }
  };

  const handleSeedTestUser = (role: DebugUserRole) =>
    runAction(
      () => seedTestUser(role),
      `Seeded ${role} test user`,
      `Failed to seed ${role} test user`
    );

  const handleLoginAs = (handle: FixtureHandle) =>
    runAction(
      () => loginAs(handle),
      `Logged in as ${handle}`,
      `Failed to log in as ${handle}`
    );

  const handleSeedLanUser = () =>
    runAction(seedLanUser, "Seeded LAN (guest) user", "Failed to seed LAN user");

  const handleSetRole = (role: DebugUserRole) =>
    runAction(() => setRole(role), `Switched to ${role}`, "Failed to switch role");

  const handleInjectFakeAccessToken = () =>
    runAction(injectFakeAccessToken, "Fake JWT injected", "Failed to inject JWT");

  const handleClearAccessToken = () =>
    runAction(clearAccessToken, "JWT cleared", "Failed to clear JWT");

  const confirmForceLogout = () => {
    Alert.alert(
      "Force logout?",
      "This signs out the current user immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => runAction(forceLogout, "Logged out", "Force logout failed"),
        },
      ]
    );
  };

  const confirmResetAuthState = () => {
    Alert.alert(
      "Reset auth state?",
      "This clears the session and wipes local data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            runAction(resetAuthState, "Auth state reset", "Reset failed"),
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={onBack} />
        <Text variant="titleMedium">Auth</Text>
      </View>

      <ScrollView>
        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Current user
          </Text>
          <Text>
            {snapshot?.username ?? "—"} ({snapshot?.userId ?? "—"})
          </Text>
          <Text>
            {snapshot?.isGuest ? "Guest" : "Authenticated"} •{" "}
            {snapshot?.isRescuer ? "Rescuer" : snapshot?.isAdmin ? "Admin" : "User"}
          </Text>
          <Text>
            {snapshot?.hasAccessToken ? "Token present" : "No token stored"}
          </Text>
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Login as fixture
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Logs in as a server-seeded qa_* account (POST /testing/seed/roles first).
          </Text>
          <View style={styles.buttonRow}>
            {FIXTURE_HANDLES.map((handle) => (
              <Button
                key={handle}
                mode="outlined"
                compact
                disabled={loading}
                onPress={() => handleLoginAs(handle)}
              >
                {handle}
              </Button>
            ))}
          </View>
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Seed test user
          </Text>
          <View style={styles.buttonRow}>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSeedTestUser("user")}
            >
              Seed auth user
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSeedTestUser("rescuer")}
            >
              Seed rescuer
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSeedTestUser("admin")}
            >
              Seed admin
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={handleSeedLanUser}
            >
              Seed LAN user
            </Button>
          </View>
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Switch role
          </Text>
          <View style={styles.buttonRow}>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSetRole("user")}
            >
              Make user
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSetRole("rescuer")}
            >
              Make rescuer
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={() => handleSetRole("admin")}
            >
              Make admin
            </Button>
          </View>
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Session
          </Text>
          <View style={styles.buttonRow}>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={handleInjectFakeAccessToken}
            >
              Inject fake JWT
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={handleClearAccessToken}
            >
              Clear JWT
            </Button>
            <Button mode="outlined" compact disabled={loading} onPress={confirmForceLogout}>
              Force logout
            </Button>
            <Button
              mode="outlined"
              compact
              disabled={loading}
              onPress={confirmResetAuthState}
            >
              Reset auth state
            </Button>
          </View>
        </View>
      </ScrollView>

      <AppSnackbar visible={toastVisible} onDismiss={hideToast} variant={toastVariant}>
        {toastMessage}
      </AppSnackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  section: {
    padding: 12,
    gap: 4,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
  },
});
