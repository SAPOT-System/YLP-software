import { Skeleton } from "@/features/shared/components/skeleton";
import { SkeletonGroup } from "@/features/shared/components/skeleton-group";
import { SkeletonList } from "@/features/shared/components/skeleton-list";
import { SkeletonText } from "@/features/shared/components/skeleton-text";
import { View } from "react-native";

/** Placeholder cards shown while the announcements list first loads. */
export function AnnouncementListSkeleton() {
  return <SkeletonGroup label="Loading announcements" style={{ paddingTop: 8 }}><SkeletonList count={4} gap={12} renderItem={() => <View testID="announcement-skeleton-card" style={{ marginHorizontal: 16, padding: 12, gap: 10, borderRadius: 16 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Skeleton width={44} height={44} borderRadius={22} /><View style={{ flex: 1, gap: 6 }}><Skeleton width="70%" height={16} /><Skeleton width="35%" height={10} /></View><Skeleton width={48} height={16} borderRadius={8} /></View><SkeletonText lines={2} lineHeight={12} lastLineWidth="45%" /></View>} /></SkeletonGroup>;
}
