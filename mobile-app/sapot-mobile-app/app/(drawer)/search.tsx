import { ChatRoomSource } from "@/features/chat/types";
import {
  usePeerService,
  useToast,
  useUserSearch,
} from "@/features/shared/hooks";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Appbar, Searchbar, Snackbar, Text } from "react-native-paper";
import { useDebounce } from "use-debounce";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const peerService = usePeerService();

  // debounce the query
  const [debouncedQuery] = useDebounce(query, 400);

  const { data, isLoading } = useUserSearch(debouncedQuery);

  const {
    visible: toastVisible,
    message: toastMessage,
    showToast,
    hideToast,
  } = useToast();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: "row", marginBottom: 20 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Searchbar
          placeholder="Search "
          value={query}
          onChangeText={setQuery}
          style={{ flex: 1 }}
        />
      </View>

      {isLoading && <Text>Searching...</Text>}
      <FlatList
        data={data || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={async () => {
              try {
                const existingPeer = await peerService.findPeerById(item.id);

                if (!existingPeer) {
                  await peerService.createUser(
                    item.id,
                    item.username,
                    item.first_name,
                    item.last_name
                  );
                }

                router.push({
                  pathname: "/(drawer)/(tabs)/chat/[id]",
                  params: { id: item.id, source: ChatRoomSource.PEER },
                });
              } catch (error) {
                console.error("[SearchScreen]: Error opening chat", error);
                showToast("Unable to open chat");
              }
            }}
          >
            <View style={{ padding: 12 }}>
              <Text>
                {item.first_name} {item.last_name}
              </Text>
              <Text>@{item.username}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!isLoading ? <Text>No users found</Text> : null}
      />
      <Snackbar
        visible={toastVisible}
        onDismiss={hideToast}
        duration={3000}
        theme={{
          colors: { inverseSurface: "#696969", inverseOnSurface: "#FFFFFF" },
        }}
      >
        {toastMessage}
      </Snackbar>
    </View>
  );
}
