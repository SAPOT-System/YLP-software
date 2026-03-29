import FontAwesome from "@expo/vector-icons/FontAwesome";
import SimpleLineIcons from "@expo/vector-icons/SimpleLineIcons";
import Entypo from "@expo/vector-icons/Entypo";
import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";

import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
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
          backgroundColor: "#FFFFFF",
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
          tabBarIcon: ({ color }) => (
            <SimpleLineIcons size={24} name="globe" color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: "Calls",
          tabBarIcon: ({ color }) => (
            <Feather name="phone-call" size={24} color={color} />
          ),
          headerShown: false,
          tabBarLabel: "Calls",
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
        }}
      />
      <Tabs.Screen
        name="chat/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
