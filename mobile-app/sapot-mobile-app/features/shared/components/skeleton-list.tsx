import React from "react";
import { View } from "react-native";

interface SkeletonListProps {
  count?: number;
  gap?: number;
  renderItem: (index: number) => React.ReactNode;
}

/** Repeats rows without knowing what each row looks like. */
export function SkeletonList({ count = 5, gap = 12, renderItem }: SkeletonListProps) {
  return <View testID="skeleton-list" style={{ gap }}>{Array.from({ length: count }, (_, index) => <React.Fragment key={index}>{renderItem(index)}</React.Fragment>)}</View>;
}
