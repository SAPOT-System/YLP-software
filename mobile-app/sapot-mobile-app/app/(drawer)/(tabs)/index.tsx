import { Pressable, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth";
import { ChatRoomSource } from "@/features/chat/types";
import { toInternationalPhone } from "@/features/auth/utils/validation";
import { ChatList, useChats } from "@/features/chat";
import { useChatService } from "@/features/chat/hooks/use-chat-service";
import { contactUnknownUser } from "@/features/shared/api/gsm.api";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import PeerList from "@/features/shared/components/peer-list";
import { Peer } from "@/features/shared/database";
import {
  useConnectionService,
  useDiscoveryService,
  usePeerService,
  useToast,
} from "@/features/shared/hooks";
import { useDialogVisibility } from "@/features/shared/hooks/use-dialog-visibility";
import { useGsmHealth } from "@/features/shared/hooks/use-gsm-health";
import { useSyncService } from "@/features/shared/hooks/use-sync-service";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { uiLog } from "@/features/shared/utils/logger";
import { useHeaderHeight } from "@react-navigation/elements";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { TouchableOpacity } from "react-native";
import {
  Button,
  Dialog,
  FAB,
  HelperText,
  Icon,
  Portal,
  Searchbar,
  TextInput as PaperTextInput,
  useTheme,
} from "react-native-paper";

export default function Chat() {
  const auth = useAuth();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const topGradientColors: [string, string] = theme.dark
    ? ["#0F1830", "#1E2E67"]
    : ["#FFF", "#99AEC7"];

  const { chats } = useChats();
  const syncService = useSyncService();
  const [refreshing, setRefreshing] = useState(false);
  const { gsmReady } = useGsmHealth();
  const userStore = useUserStore();
  const {
    visible: fabDialogVisible,
    show: showFabDialog,
    hide: hideFabDialog,
  } = useDialogVisibility();
  const [targetPhone, setTargetPhone] = useState("");
  const [contacting, setContacting] = useState(false);
  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showToast,
    showError,
    hideToast,
  } = useToast();

  const isFabEnabled =
    gsmReady &&
    !userStore.isGuest &&
    !!(userStore.user as Peer).phoneNumberVerified;

  const currentUserPhone = toInternationalPhone(
    (userStore.user as Peer)?.phoneNumber ?? ""
  );

  const isSelfPhone = (phone: string) =>
    toInternationalPhone(phone.trim()) === currentUserPhone;

  const isValidPhone = (phone: string) =>
    /^\+639\d{9}$/.test(toInternationalPhone(phone.trim())) &&
    !isSelfPhone(phone);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncService.syncNow();
    setRefreshing(false);
  };

  const router = useRouter();
  const discoveryService = useDiscoveryService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();
  const chatService = useChatService();

  useEffect(() => {
    uiLog.debug("[Chat] useEffect triggered, deps:", {
      accessToken: auth.accessToken ? "[REDACTED]" : undefined,
    });
    connectionService.setSignalingToken(auth.accessToken ?? undefined);
  }, [auth.accessToken, connectionService]);

  useEffect(() => {
    uiLog.info("[Chat] mounted");

    return () => {
      uiLog.info("[Chat] unmounted");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await discoveryService.publishDevice();

        if (cancelled) {
          return;
        }

        discoveryService.startDiscovery();
        connectionService.start();
      } catch (error) {
        uiLog.error("[Chat] failed to publish discovery service", { error });

        if (!cancelled) {
          discoveryService.startDiscovery();
          connectionService.start();
        }
      }
    })();

    return () => {
      cancelled = true;
      void discoveryService.destroy();
      connectionService.stop();
    };
  }, [discoveryService, connectionService]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={topGradientColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.topSection, { paddingTop: headerHeight + 16 }]}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              uiLog.debug("[Chat] onPress triggered");
              uiLog.info("[Navigation] Navigating to Search", {
                screen: APP_ROUTES.SEARCH,
              });
              router.push(APP_ROUTES.SEARCH);
            }}
            style={{ flexGrow: 1 }}
          >
            <Searchbar
              pointerEvents="none"
              editable={false}
              value=""
              placeholder="Search"
              iconColor={theme.dark ? "#7E8AA6" : "#000000"}
              placeholderTextColor={theme.dark ? "#7E8AA6" : "#696969"}
              style={[
                styles.searchbar,
                {
                  backgroundColor: theme.dark ? "#0F172A" : "#FFFFFF",
                  color: theme.dark ? "#7E8AA6" : "#696969",
                },
              ]}
            />
          </TouchableOpacity>
          <Pressable
            onPress={() => {
              uiLog.debug("[Chat] onPress triggered");
              uiLog.info("[Navigation] Navigating to ScanQr", {
                screen: APP_ROUTES.SCAN_QR,
              });
              router.push(APP_ROUTES.SCAN_QR);
            }}
          >
            <View
              style={{
                backgroundColor: "#3A7AFE",
                padding: 12,
                borderWidth: 1,
                borderColor: "#000000",
                elevation: 6,
                borderRadius: 55,
              }}
            >
              <Icon source="qrcode" size={30} color="white" />
            </View>
          </Pressable>
        </View>
        <PeerList />
      </LinearGradient>
      <View style={[styles.chatListContainer, { backgroundColor: "none" }]}>
        <ChatList chats={chats} refreshing={refreshing} onRefresh={onRefresh} />
      </View>

      {!auth.isGuest && (
        <FAB
          icon="cellphone-message"
          style={[styles.fab, !isFabEnabled && { opacity: 0.5 }]}
          onPress={() => {
            if (!isFabEnabled) {
              if (!gsmReady)
                showToast("SMS service is not available right now.");
              else if (userStore.isGuest)
                showToast("Sign in to use this feature.");
              else showToast("Verify your phone number to use this feature.");
              return;
            }
            showFabDialog();
          }}
        />
      )}

      <Portal>
        <Dialog visible={fabDialogVisible} onDismiss={hideFabDialog}>
          <Dialog.Title>Contact by Phone</Dialog.Title>
          <Dialog.Content>
            <PaperTextInput
              label="Phone number"
              value={targetPhone}
              onChangeText={setTargetPhone}
              keyboardType="phone-pad"
              autoFocus
              error={targetPhone.length > 0 && !isValidPhone(targetPhone)}
            />
            <HelperText
              type="error"
              visible={targetPhone.length > 0 && !isValidPhone(targetPhone)}
            >
              {isSelfPhone(targetPhone)
                ? "You cannot contact yourself."
                : "Use format: +639XXXXXXXXX or 09XXXXXXXXX"}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideFabDialog}>Cancel</Button>
            <Button
              loading={contacting}
              disabled={contacting || !isValidPhone(targetPhone)}
              onPress={async () => {
                setContacting(true);
                try {
                  const phone = toInternationalPhone(targetPhone.trim());
                  const res = await contactUnknownUser(phone);
                  await peerService.upsertPeer({
                    id: res.user_id,
                    username: phone,
                    phoneNumber: phone,
                    phoneNumberVerified: true,
                  });
                  if (res.is_sapot_user) {
                    await chatService.getOrCreateDirectConversationByPeer(
                      res.user_id
                    );
                  } else {
                    await chatService.getOrCreateSmsConversationByPeer(
                      res.user_id
                    );
                  }
                  hideFabDialog();
                  setTargetPhone("");
                  if (res.is_sapot_user) {
                    showToast("Opening conversation with this Sapot user.");
                  } else {
                    showToast(
                      "SMS sent! They'll receive a message to connect with you."
                    );
                  }
                  router.push({
                    pathname: "/(drawer)/(tabs)/chat/[id]",
                    params: {
                      id: res.user_id,
                      source: ChatRoomSource.PEER,
                    },
                  });
                } catch {
                  showError(
                    "Failed to contact user. Check phone number format (+63...)."
                  );
                } finally {
                  setContacting(false);
                }
              }}
            >
              Contact
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <AppSnackbar
        visible={toastVisible}
        onDismiss={hideToast}
        variant={toastVariant}
      >
        {toastMessage}
      </AppSnackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
  },
  topSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  chatListContainer: {
    flex: 1,
    paddingTop: 10,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
  },
  searchbar: {
    marginBottom: 12,
  },
});
