import { Skeleton } from "@/features/shared/components/skeleton";
import { SkeletonGroup } from "@/features/shared/components/skeleton-group";
import { View } from "react-native";

/** Placeholder shown while the QR screen's user record loads. */
export function QrCodeSkeleton() {
  return <SkeletonGroup label="Loading QR code" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}><View style={{ padding: 20, borderRadius: 20, alignItems: "center", gap: 16 }}><Skeleton width={220} height={220} borderRadius={8} /><Skeleton width={140} height={18} /><Skeleton width={100} height={12} /></View></SkeletonGroup>;
}
