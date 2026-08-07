import { Skeleton } from "@/features/shared/components/skeleton";
import { SkeletonGroup } from "@/features/shared/components/skeleton-group";
import { SkeletonList } from "@/features/shared/components/skeleton-list";
import { View } from "react-native";

/** Placeholder rows shown while the first search-results page loads. */
export function SearchResultsSkeleton() {
  return <SkeletonGroup label="Loading results"><SkeletonList count={6} gap={0} renderItem={() => <View testID="search-skeleton-row" style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}><Skeleton width={48} height={48} borderRadius={24} /><View style={{ flex: 1, gap: 6 }}><Skeleton width="50%" height={14} /><Skeleton width="30%" height={10} /></View></View>} /></SkeletonGroup>;
}
