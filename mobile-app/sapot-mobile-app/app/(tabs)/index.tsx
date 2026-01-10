import { FlatList, Pressable, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";
import useLanUsers from "@/features/chat";
import zeroconf from "@/features/chat/services/zeroconf-service";
import { useEffect } from "react";

export default function TabOneScreen() {
  const { services } = useLanUsers();

  useEffect(() => {
    zeroconf.publishService();
    zeroconf.startDiscovery();

    return () => {
      zeroconf.close();
    };
  }, []);

  useEffect(() => {
    console.log(services);
  }, [services]);

  return (
    <View style={styles.container}>
      <FlatList
        data={services}
        renderItem={({ item }) => (
          <View>
            <Text>
              Name: {item.name}
              IP Address: {item.addresses[0]}
              Port: {item.port}
              ID: {item.txt.id}
            </Text>
          </View>
        )}
        keyExtractor={(item) => item.txt.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
});
