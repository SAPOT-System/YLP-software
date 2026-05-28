import { useAuth } from "@/features/auth";
import { useConnectionService } from "@/features/shared/hooks";
import { navLog } from "@/features/shared/utils/logger";
import Entypo from "@expo/vector-icons/Entypo";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import SimpleLineIcons from "@expo/vector-icons/SimpleLineIcons";
import { router, Tabs, usePathname } from "expo-router";
import React, { useEffect } from "react";
import { View } from "react-native";
import { Appbar, Text, useTheme } from "react-native-paper";

import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

function IncomingCallListener() {
  const connectionService = useConnectionService();
  const pathname = usePathname();

  useEffect(() => {
    navLog.info("[IncomingCallListener] mounted");
    const handleAudioCall = ({
      peerId,
      callerName,
      conversationId,
      callId,
    }: {
      peerId: string;
      callerName: string;
      conversationId?: string;
      callId?: string;
    }) => {
      // Skip if already on the incoming screen (e.g. navigated there by notification)
      if (pathname.includes("call/incoming")) {
        navLog.info(
          "[IncomingCallListener] audio-call skipped — already on incoming screen"
        );
        return;
      }
      navLog.info("[Navigation] Navigating to IncomingCall", {
        screen: "/(drawer)/(tabs)/call/incoming",
        peerId,
        type: "audio",
      });
      router.push({
        pathname: "/(drawer)/(tabs)/call/incoming",
        params: {
          id: peerId,
          type: "audio",
          callerName: callerName,
          conversationId: conversationId,
          callId: callId,
        },
      });
    };
    const handleVideoCall = ({
      peerId,
      callerName,
      conversationId,
      callId,
    }: {
      peerId: string;
      callerName: string;
      conversationId?: string;
      callId?: string;
    }) => {
      if (pathname.includes("call/incoming")) {
        navLog.info(
          "[IncomingCallListener] video-call skipped — already on incoming screen"
        );
        return;
      }
      navLog.info("[Navigation] Navigating to IncomingCall", {
        screen: "/(drawer)/(tabs)/call/incoming",
        peerId,
        type: "video",
      });
      router.push({
        pathname: "/(drawer)/(tabs)/call/incoming",
        params: {
          id: peerId,
          type: "video",
          callerName: callerName,
          conversationId: conversationId,
          callId: callId,
        },
      });
    };
    connectionService.on("audio-call", handleAudioCall);
    connectionService.on("video-call", handleVideoCall);
    return () => {
      navLog.info("[IncomingCallListener] unmounted");
      connectionService.off("audio-call", handleAudioCall);
      connectionService.off("video-call", handleVideoCall);
    };
  }, [connectionService, pathname]);

  return null;
}

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const { isRescuer, isGuest } = useAuth();

  useEffect(() => {
    navLog.info("[TabLayout] mounted");
    return () => {
      navLog.info("[TabLayout] unmounted");
    };
  }, []);

  return (
    <>
      <IncomingCallListener />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#3A7AFE",
          tabBarInactiveTintColor: Colors[colorScheme ?? "light"].tint,
          tabBarLabel: ({ children, color, focused }) => (
            <View
              style={{ alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Text
                style={{
                  color,
                  fontSize: 12,
                  fontWeight: focused ? "600" : "500",
                }}
              >
                {children}
              </Text>
              <View
                style={{
                  width: 55,
                  height: 2,
                  borderRadius: 999,
                  backgroundColor: "#3A7AFE",
                  opacity: focused ? 1 : 0,
                }}
              />
            </View>
          ),
          tabBarStyle: {
            display: "flex",
            width: "100%",
            maxWidth: 440,
            height: 70,
            paddingVertical: 21,
            paddingHorizontal: 10,
            alignItems: "center",
            gap: 14,
            alignSelf: "center",
            backgroundColor: theme.dark ? "#0B1020" : "#FFFFFF",
            borderTopWidth: 0,
            borderTopColor: "transparent",
          },
        }}
      >
        {/* TODO: apply paper */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Chats",
            tabBarLabel: "Chats",
            tabBarIcon: ({ color }) => (
              <Entypo name="chat" size={24} color={color} />
            ),
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="debug"
          options={{
            title: "Debugger",
            tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
            href: null,
          }}
        />
        <Tabs.Screen
          name="public-chat"
          options={{
            title: "Public Chat",
            tabBarLabel: "Public Chat",
            headerTitleAlign: "center",
            headerTitleStyle: { fontWeight: "bold", fontSize: 24 },
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "transparent" },
            href: isGuest ? null : undefined,
            tabBarIcon: ({ color }) => (
              <SimpleLineIcons size={24} name="globe" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: "Live Map",
            tabBarLabel: "Map",
            tabBarIcon: ({ color }) => (
              <Feather name="map" size={24} color={color} />
            ),
            headerTitleAlign: "center",
            headerTitleStyle: { fontWeight: "bold", fontSize: 24 },
            headerTransparent: true,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "transparent" },
            href: isRescuer ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="server"
          options={{
            title: "Server",
            tabBarIcon: ({ color }) => (
              <Feather name="cloud" size={24} color={color} />
            ),
            headerShown: false,
            tabBarLabel: "Server",
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => (
              <Feather name="settings" size={24} color={color} />
            ),
            headerShown: false,
            tabBarLabel: "Settings",
          }}
        />
        <Tabs.Screen
          name="call/[id]"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="call/incoming"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="chat/[id]"
          options={{
            href: null,
            headerShown: false,
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="scan-qr"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
            header: ({ options }) => (
              <Appbar.Header statusBarHeight={0} style={{ height: 80 }}>
                <Appbar.BackAction
                  onPress={() => {
                    navLog.info("[Navigation] goBack triggered from ScanQr");
                    router.back();
                  }}
                />

                <Appbar.Content
                  titleStyle={{
                    fontWeight: "bold",
                    color: theme.dark ? "#E6ECF5" : "#000",
                    fontSize: 24,
                  }}
                  title={options.title ?? "QR Code"}
                />
              </Appbar.Header>
            ),
          }}
        />
        <Tabs.Screen
          name="peer/[id]"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
            header: () => (
              <Appbar.Header statusBarHeight={0} style={{ height: 80 }}>
                <Appbar.BackAction
                  onPress={() => {
                    navLog.info("[Navigation] goBack triggered from Peer");
                    router.back();
                  }}
                />
              </Appbar.Header>
            ),
          }}
        />
      </Tabs>
    </>
  );
}
