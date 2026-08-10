import { APP_ROUTES } from "@/config/routes";
import { HelpIconButton, useTourAnchor } from "@/features/help";
import { AnnouncementCard } from "@/features/announcements/components/announcement-card";
import { useAnnouncementNewCount } from "@/features/announcements/hooks/use-announcement-new-count";
import { useAnnouncements } from "@/features/announcements/hooks/use-announcements";
import {
  AnnouncementFilter,
  AnnouncementPriority,
} from "@/features/announcements/types";
import motion from "@/constants/motion";
import { AppSnackbar } from "@/features/shared/components/app-snackbar";
import { useReducedMotion, useToast } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/core/utils/logger";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { Easing, FadeInUp } from "react-native-reanimated";
import { Appbar, Chip, Text, useTheme } from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";

const FILTERS: { key: AnnouncementFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "normal", label: "Medium" },
  { key: "low", label: "Low" },
];

const PRIORITY_ORDER: Record<AnnouncementPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export default function AnnouncementsScreen() {
  const theme = useTheme();
  const [activeFilter, setActiveFilter] = useState<AnnouncementFilter>("all");
  const { data, isLoading, isError, refetch } = useAnnouncements();
  const { newCount, markAllSeen } = useAnnouncementNewCount(
    data?.announcements ?? []
  );
  const { visible, message, variant, showError, hideToast } = useToast();
  const reducedMotion = useReducedMotion();
  const announcementsAnchor = useTourAnchor("announcements-drawer-item");

  const markedRef = useRef(false);

  useEffect(() => {
    uiLog.info("[AnnouncementsScreen] mounted");
    return () => {
      uiLog.info("[AnnouncementsScreen] unmounted");
      markedRef.current = false;
    };
  }, []);

  // Mark all current announcements as seen once per mount, after data loads.
  // Using a ref so subsequent polls don't immediately mark new arrivals as seen.
  useFocusEffect(
    useCallback(() => {
      uiLog.info(
        "[AnnouncementsScreen] mark all seen mount",
        data?.announcements?.length,
        markedRef.current
      );
      if (data?.announcements?.length && !markedRef.current) {
        markedRef.current = true;
        uiLog.info("[AnnouncementsScreen] mark all seen");
        markAllSeen();
      }

      return () => {
        markedRef.current = false;
        uiLog.info("[AnnouncementsScreen] mark all seen unmount");
      };
      // markAllSeen intentionally excluded: only run once when data first arrives
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.announcements])
  );

  useEffect(() => {
    if (isError) {
      uiLog.error("[AnnouncementsScreen] failed to load announcements");
      showError("Failed to load announcements");
    }
  }, [isError, showError]);

  const filtered = useMemo(() => {
    const list = data?.announcements ?? [];
    const byPriority =
      activeFilter === "all"
        ? list
        : list.filter((a) => a.priority === activeFilter);
    return [...byPriority].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  }, [data, activeFilter]);

  const counts = useMemo(() => {
    const list = data?.announcements ?? [];
    return {
      all: list.length,
      high: list.filter((a) => a.priority === "high").length,
      normal: list.filter((a) => a.priority === "normal").length,
      low: list.filter((a) => a.priority === "low").length,
    };
  }, [data]);

  const bgColor = theme.dark ? "#0F1830" : "#EAEDF3";
  const headerBg = theme.dark ? "#1E2E67" : "#fff";

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Appbar.Header
        statusBarHeight={0}
        style={[styles.appbar, { backgroundColor: headerBg }]}
      >
        <Appbar.BackAction
          onPress={() => {
            uiLog.info("[Navigation] AnnouncementsScreen back pressed", {
              canGoBack: router.canGoBack(),
            });
            if (router.canGoBack()) {
              router.back();
            } else {
              router.navigate(APP_ROUTES.HOME);
            }
          }}
        />
        <View ref={announcementsAnchor.ref} onLayout={announcementsAnchor.onLayout} collapsable={false} style={{ flex: 1 }}>
          <Appbar.Content
            title="Announcements"
            titleStyle={[
              styles.appbarTitle,
              { color: theme.colors.onSurface },
            ]}
          />
        </View>
        <HelpIconButton articleId="announcements" />
        {newCount > 0 && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{newCount} new</Text>
          </View>
        )}
      </Appbar.Header>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            compact
            selected={activeFilter === f.key}
            onPress={() => {
              uiLog.debug("[AnnouncementsScreen] filter changed", {
                filter: f.key,
              });
              setActiveFilter(f.key);
            }}
            style={[styles.chip, activeFilter === f.key && styles.chipSelected]}
            textStyle={[
              styles.chipText,
              activeFilter === f.key && styles.chipTextSelected,
            ]}
          >
            {f.label} · {counts[f.key]}
          </Chip>
        ))}
      </ScrollView>

      {isLoading ? (
        <LoadingSpinner style={styles.loader} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Animated.View
              entering={
                reducedMotion
                  ? undefined
                  : FadeInUp.duration(motion.duration.base).easing(
                      Easing.bezier(...motion.easing.standard)
                    )
              }
            >
              <AnnouncementCard
                id={item.id}
                title={item.title}
                content={item.content}
                priority={item.priority}
                created_at={item.created_at}
              />
            </Animated.View>
          )}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ color: "#6B7280" }}>No announcements</Text>
            </View>
          }
        />
      )}

      <AppSnackbar visible={visible} onDismiss={hideToast} variant={variant}>
        {message}
      </AppSnackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appbar: {
    elevation: 0,
    height: 60,
  },
  appbarTitle: {
    fontWeight: "bold",
    fontSize: 20,
  },
  newBadge: {
    backgroundColor: "#3A7AFE",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 12,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    borderRadius: 20,
    height: 32,
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: "#3A7AFE",
  },
  chipText: {
    fontSize: 13,
    lineHeight: 16,
  },
  chipTextSelected: {
    color: "#fff",
  },
  loader: {
    marginTop: 40,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
  },
});
