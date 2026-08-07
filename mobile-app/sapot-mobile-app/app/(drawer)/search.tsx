import { APP_ROUTES } from "@/config/routes";
import { ChatRoomSource } from "@/features/chat/types";
import motion from "@/constants/motion";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { SearchResultsSkeleton } from "@/features/shared/components/search-results-skeleton";
import {
  useReducedMotion,
  usePeerService,
  useDelayedLoading,
  useProfilePhoto,
  useToast,
  useUserSearch,
} from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/core/utils/logger";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import Animated, { Easing, FadeInUp } from "react-native-reanimated";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";
import {
  Appbar,
  Avatar,
  Icon,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useDebounce } from "use-debounce";

type SearchUser = {
  id: string;
  username: string;
  first_name: string;
  last_name?: string;
  phone_is_verified?: boolean;
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
          <Text
            style={{
              color: theme.dark ? "#FFFFFF" : "#1E1E1E",
              fontWeight: "medium",
            }}
          >
            {item.first_name} {item.last_name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 14 }}>
            @{item.username}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const peerService = usePeerService();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const seenIdsRef = useRef<Set<string>>(new Set());

  // debounce the query
  const [debouncedQuery] = useDebounce(query, 400);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useUserSearch(debouncedQuery);
  const showSkeleton = useDelayedLoading(isLoading);

  const results = useMemo(() => data?.pages.flat() ?? [], [data?.pages]);

  const [localPeers, setLocalPeers] = useState<SearchUser[]>([]);

  const loadLocalPeers = useCallback(
    async (q: string) => {
      try {
        const peers = await peerService.getAllPeers();
        const mapped: SearchUser[] = (peers ?? []).map((p):SearchUser => ({
          id: p.id,
          username: p.username  ?? "",
          first_name: p.firstName ?? "",
          last_name: p.lastName ?? "",
          phone_is_verified: p.phoneNumberVerified ?? false,
        }));

        const filtered =
          q && q.length > 0
            ? mapped.filter(
                (u) =>
                  u.username?.toLowerCase().includes(q.toLowerCase()) ||
                  u.first_name?.toLowerCase().includes(q.toLowerCase()) ||
                  (u.last_name ?? "").toLowerCase().includes(q.toLowerCase())
              )
            : mapped;

        setLocalPeers(filtered);
      } catch (err) {
        uiLog.error("[SearchScreen] loadLocalPeers failed", { error: err });
      }
    },
    [peerService]
  );

  useEffect(() => {
    loadLocalPeers(debouncedQuery);
  }, [debouncedQuery, loadLocalPeers]);

  const mergedResults = useMemo(() => {
    const map = new Map<string, SearchUser>();
    // prefer local peers first
    localPeers.forEach((p) => map.set(p.id, p));
    results.forEach((r) => {
      if (!map.has(r.id)) map.set(r.id, r);
    });
    return Array.from(map.values());
  }, [results, localPeers]);

  const {
    visible: toastVisible,
    message: toastMessage,
    variant: toastVariant,
    showError,
    hideToast,
  } = useToast();

  useEffect(() => {
    uiLog.info("[SearchScreen] mounted");
    return () => {
      uiLog.info("[SearchScreen] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[SearchScreen] useEffect triggered, deps:", {
      queryLength: query.length,
      debouncedQueryLength: debouncedQuery.length,
    });
  }, [query, debouncedQuery]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-start",
          marginBottom: 20,
        }}
      >
        <Appbar.BackAction
          onPress={() => {
            uiLog.info("[Navigation] goBack triggered from Search");
            router.back();
          }}
        />
        <Searchbar
          placeholder="Search "
          value={query}
          onChangeText={(value) => {
            uiLog.debug("[SearchScreen] onChangeText", {
              queryLength: value.length,
            });
            setQuery(value);
          }}
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
        <Pressable
          onPress={() => {
            uiLog.debug("[SearchScreen] onPress triggered");
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

      {showSkeleton ? <SearchResultsSkeleton /> : <FlatList
        data={mergedResults}
        keyExtractor={(item) => item.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <LoadingSpinner style={{ padding: 16 }} />
          ) : null
        }
        renderItem={({ item }) => {
          const isNewResult = !seenIdsRef.current.has(item.id);
          seenIdsRef.current.add(item.id);

          const resultItem = (
            <SearchResultItem
              item={item}
              onPress={async (selected) => {
                uiLog.debug("[SearchScreen] onPress triggered", {
                  peerId: selected.id,
                  phoneNumberIsVerified: selected.phone_is_verified
                });
                try {
                  const existingPeer = await peerService.findPeerById(
                    selected.id
                  );

                  if (!existingPeer) {
                    await peerService.createUser(
                      selected.id,
                      selected.username,
                      selected.first_name,
                      selected.last_name,
                      undefined,
                      undefined,
                      undefined,
                      selected.phone_is_verified
                    );
                    // refresh local peers after creating
                    await loadLocalPeers(debouncedQuery);
                  }

                  uiLog.info("[Navigation] Navigating to ChatRoom", {
                    screen: "/(drawer)/(tabs)/chat/[id]",
                    peerId: selected.id,
                  });
                  router.push({
                    pathname: "/(drawer)/(tabs)/chat/[id]",
                    params: { id: selected.id, source: ChatRoomSource.PEER },
                  });
                } catch (error) {
                  uiLog.error("search › open chat failed", {
                    peerId: selected.id,
                    error,
                  });
                  showError("Unable to open chat");
                }
              }}
            />
          );

          if (reducedMotion || !isNewResult) {
            return resultItem;
          }

          return (
            <Animated.View
              entering={FadeInUp.duration(motion.duration.base).easing(
                Easing.bezier(...motion.easing.standard)
              )}
            >
              {resultItem}
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          !isLoading &&
          mergedResults.length === 0 &&
          debouncedQuery.length > 0 ? (
            <Text>No users found</Text>
          ) : null
        }
      />}
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
