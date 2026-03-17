import { useUserSearch } from "@/features/shared/hooks";
import { router } from "expo-router";
import { useState } from "react";
import { View, FlatList } from "react-native";
import { Appbar, Searchbar, Text } from "react-native-paper";
import { useDebounce } from "use-debounce";

export default function SearchScreen() {
  const [query, setQuery] = useState("");

  // debounce the query
  const [debouncedQuery] = useDebounce(query, 400);

  const { data, isLoading } = useUserSearch(debouncedQuery);

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
          <View style={{ padding: 12 }}>
            <Text>
              {item.first_name} {item.last_name}
            </Text>
            <Text>@{item.username}</Text>
          </View>
        )}
        ListEmptyComponent={!isLoading ? <Text>No users found</Text> : null}
      />
    </View>
  );
}
