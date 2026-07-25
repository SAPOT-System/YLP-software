import { ChatRoomSource } from "@/features/chat/types";
import motion from "@/constants/motion";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import Animated, { Easing, ZoomIn } from "react-native-reanimated";
import { Avatar, Text, useTheme } from "react-native-paper";
import { Peer } from "../core/database";
import { PeerListEntry, usePeerListData } from "../hooks/use-peer-list-data";
import { useProfilePhoto } from "../hooks/use-profile-photo";
import { useReducedMotion } from "../hooks";
import { uiLog } from "../core/utils/logger";

uiLog.debug("[peer-list] module loaded");

const ONLINE_DOT_SIZE = 14;

const PeerList = () => {
  const entries = usePeerListData();
  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <FlatList
        horizontal
        contentContainerStyle={{ gap: 24 }}
        data={entries}
        renderItem={({ item }) => (
          <PeerListItem peer={item.peer} isOnline={item.isOnline} />
        )}
        keyExtractor={({ peer }: PeerListEntry) => peer.id}
      />
    </View>
  );
};

const enhancePeer = withObservables(["peer"], ({ peer }: { peer: Peer }) => ({
  peer: peer.observe(),
}));

const PeerListItemInner = ({
  peer,
  isOnline,
}: {
  peer: Peer;
  isOnline: boolean;
}) => {
  const router = useRouter();
  const theme = useTheme();
  const { url: profilePicUrl } = useProfilePhoto(peer.id);
  const reducedMotion = useReducedMotion();

  const handlePress = () => {
    uiLog.info("peer-list › open chat", { peerId: peer.id });
    router.push({
      pathname: "/(drawer)/(tabs)/chat/[id]",
      params: { id: peer.id, source: ChatRoomSource.PEER },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ display: "flex", alignItems: "center" }}
    >
      <View style={{ position: "relative" }}>
        {profilePicUrl ? (
          <Avatar.Image size={60} source={{ uri: profilePicUrl }} />
        ) : (
          <Avatar.Text
            size={60}
            label={(
              peer.firstName?.[0] ??
              peer.username?.[0] ??
              "?"
            ).toUpperCase()}
          />
        )}
        {isOnline && (
          <Animated.View
            entering={
              reducedMotion
                ? undefined
                : ZoomIn.duration(motion.duration.fast).easing(
                    Easing.bezier(...motion.easing.emphasized)
                  )
            }
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: ONLINE_DOT_SIZE,
              height: ONLINE_DOT_SIZE,
              borderRadius: ONLINE_DOT_SIZE / 2,
              backgroundColor: "#22c55e",
              borderWidth: 2,
              borderColor: theme.colors.background,
            }}
          />
        )}
      </View>
      <Text style={{ color: theme.dark ? "#9AA7C1" : "#103462" }}>
        {peer.firstName}
      </Text>
    </Pressable>
  );
};

const PeerListItem = enhancePeer(PeerListItemInner);

export default PeerList;
