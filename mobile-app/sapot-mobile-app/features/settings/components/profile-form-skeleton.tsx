import { Skeleton } from "@/features/shared/components/skeleton";
import { SkeletonGroup } from "@/features/shared/components/skeleton-group";
import { SkeletonList } from "@/features/shared/components/skeleton-list";
import { View } from "react-native";

/** Placeholder shown while the profile form's user record loads. */
export function ProfileFormSkeleton() {
  return <SkeletonGroup label="Loading profile" style={{ padding: 16, gap: 28 }}><View style={{ alignItems: "center", gap: 8 }}><Skeleton width={100} height={100} borderRadius={50} /><Skeleton width={100} height={14} /></View><SkeletonList count={4} gap={20} renderItem={() => <View testID="profile-skeleton-field" style={{ gap: 8 }}><Skeleton width="30%" height={12} /><Skeleton width="100%" height={48} borderRadius={8} /></View>} /></SkeletonGroup>;
}
