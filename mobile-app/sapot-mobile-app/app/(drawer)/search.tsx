import { ChatRoomSource } from "@/features/chat/types";
import {
  usePeerService,
  useProfilePhoto,
  useToast,
  useUserSearch,
} from "@/features/shared/hooks";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import {
  Appbar,
  Avatar,
  Icon,
  Searchbar,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useDebounce } from "use-debounce";
import { APP_ROUTES } from "../routes";

type SearchUser = {
  id: string;
  username: string;
  first_name: string;
  last_name?: string;
};

const SearchResultItem = ({
  item,
  onPress,
}: {
  item: SearchUser;
  onPress: (item: SearchUser) => void;
}) => {
  const { url: profilePicUrl } = useProfilePhoto(item.id);
  const theme = useTheme();

  return (
    <Pressable onPress={() => onPress(item)}>
      <View
        style={{
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        {profilePicUrl ? (
          <Avatar.Image size={48} source={{ uri: profilePicUrl }} />
        ) : (
          <Avatar.Text
            size={48}
            label={(
              item.first_name?.[0] ??
              item.username?.[0] ??
              "?"
            ).toUpperCase()}
          />
        )}
        <View>
          <Text style={{ color: theme.dark ? "#FFFFFF" : "#1E1E1E", fontWeight: "medium" }}>
            {item.first_name} {item.last_name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 14 }}>Not Connected</Text>
        </View>
      </View>
    </Pressable>
  );
};

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const peerService = usePeerService();
  const theme = useTheme();

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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          marginBottom: 20,
        }}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Searchbar
          placeholder="Search "
          value={query}
          onChangeText={setQuery}
          iconColor={theme.dark ? "#7E8AA6" : "#000000"}
          placeholderTextColor={theme.dark ? "#7E8AA6" : "#103462"}
          style={{
            flexGrow: 1,
            backgroundColor: theme.dark ? "#0F172A" : "#FFFFFF",
            color: theme.dark ? "#7E8AA6" : "#696969",
            borderWidth: 1,
            marginRight: 8,
          }}
        />
        <Pressable onPress={() => router.push(APP_ROUTES.SCAN_QR)}>
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

      {isLoading && <Text>Searching...</Text>}
      <FlatList
        data={(data || []) as SearchUser[]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SearchResultItem
            item={item}
            onPress={async (selected) => {
              try {
                const existingPeer = await peerService.findPeerById(
                  selected.id
                );

                if (!existingPeer) {
                  await peerService.createUser(
                    selected.id,
                    selected.username,
                    selected.first_name,
                    selected.last_name
                  );
                }

                router.push({
                  pathname: "/(drawer)/(tabs)/chat/[id]",
                  params: { id: selected.id, source: ChatRoomSource.PEER },
                });
              } catch (error) {
                console.error("[SearchScreen]: Error opening chat", error);
                showToast("Unable to open chat");
              }
            }}
          />
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
