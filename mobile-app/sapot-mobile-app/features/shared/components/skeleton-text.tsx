import React from "react";
import { View } from "react-native";
import { Skeleton } from "./skeleton";

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: `${number}%`;
}

/** Stacked placeholder lines with a short final line to read as prose. */
export function SkeletonText({ lines = 3, lineHeight = 12, gap = 8, lastLineWidth = "60%" }: SkeletonTextProps) {
  return <View style={{ gap }}>{Array.from({ length: lines }, (_, index) => <Skeleton key={index} testID="skeleton-text-line" height={lineHeight} width={index === lines - 1 ? lastLineWidth : "100%"} />)}</View>;
}
