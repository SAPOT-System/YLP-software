import { Skeleton } from "@/features/shared/components/skeleton";
import { View } from "react-native";

const BUBBLE_WIDTHS: Array<{ align: "flex-start" | "flex-end"; width: `${number}%` }> = [
  { align: "flex-start", width: "55%" },
  { align: "flex-end", width: "40%" },
  { align: "flex-start", width: "65%" },
  { align: "flex-start", width: "35%" },
  { align: "flex-end", width: "50%" },
];

/** Placeholder rows shown while a conversation's messages are loading. */
export function ChatMessageSkeleton() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 20 }}>
      {BUBBLE_WIDTHS.map((bubble, index) => (
        <View key={index} style={{ alignItems: bubble.align, gap: 6 }}>
          <Skeleton width="30%" height={10} />
          <Skeleton width={bubble.width} height={38} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}
