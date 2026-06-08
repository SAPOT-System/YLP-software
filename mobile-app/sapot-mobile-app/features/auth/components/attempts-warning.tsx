import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface AttemptsWarningProps {
  attemptsRemaining: number;
}

export const AttemptsWarning = ({ attemptsRemaining }: AttemptsWarningProps) => {
  const { colors } = useTheme();

  if (attemptsRemaining < 0) return null;

  const isLastChance = attemptsRemaining === 0;
  const noun = attemptsRemaining === 1 ? 'attempt' : 'attempts';

  return (
    <View
      testID="attempts-warning"
      style={[styles.container, { backgroundColor: colors.secondaryContainer }]}
    >
      <Text style={[styles.text, { color: colors.onSecondaryContainer }]}>
        {isLastChance
          ? 'Warning: This is your last chance. Your device will be locked on your next failed attempt.'
          : `Warning: ${attemptsRemaining} ${noun} remaining before your device is locked.`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
  },
});
