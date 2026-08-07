import { View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

interface TourStepCardProps { title: string; body: string; stepIndex: number; totalSteps: number; onNext: () => void; onSkip: () => void }
export function TourStepCard({ title, body, stepIndex, totalSteps, onNext, onSkip }: TourStepCardProps) {
  const theme = useTheme(); const isLast = stepIndex + 1 >= totalSteps;
  return <View style={{ padding: 16, borderRadius: 12, gap: 8, backgroundColor: theme.colors.surface }}><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{`${stepIndex + 1} of ${totalSteps}`}</Text><Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{title}</Text><Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{body}</Text><View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}><Button mode="text" onPress={onSkip}>Skip</Button><Button mode="contained" onPress={onNext}>{isLast ? "Done" : "Next"}</Button></View></View>;
}
