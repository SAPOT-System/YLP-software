import { Skeleton } from "@/features/shared/components/skeleton";
import { SkeletonGroup } from "@/features/shared/components/skeleton-group";
import { View } from "react-native";

/** Placeholder shown while a peer profile loads. */
export function PeerProfileSkeleton() {
  return <SkeletonGroup label="Loading profile" style={{ alignItems: "center", gap: 20 }}><Skeleton width={150} height={150} borderRadius={75} /><View style={{ alignItems: "center", gap: 8 }}><Skeleton width={180} height={24} /><Skeleton width={110} height={14} /></View></SkeletonGroup>;
}
