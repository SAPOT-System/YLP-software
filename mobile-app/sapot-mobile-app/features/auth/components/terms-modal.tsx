import { fetchTermsContent } from "@/features/auth/api/auth.api";
import { authLog } from "@/features/shared/utils/logger";
import React, { useEffect, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Divider,
  Modal,
  Portal,
  Text,
  useTheme,
} from "react-native-paper";

interface TermsModalProps {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

const NUMBERED_SECTION = /^\d+\.\s+[A-Z]/;
const ALL_CAPS_LINE = /^[A-Z][A-Z\s&,\-/()]+$/;

function TermsContent({ content, textColor }: { content: string; textColor: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <View key={index} style={{ height: 8 }} />;
        }

        if (NUMBERED_SECTION.test(trimmed)) {
          return (
            <Text
              key={index}
              variant="titleSmall"
              style={{ fontWeight: "bold", color: textColor, marginTop: 12, marginBottom: 4 }}
            >
              {trimmed}
            </Text>
          );
        }

        if (ALL_CAPS_LINE.test(trimmed) && trimmed.length > 3) {
          return (
            <Text
              key={index}
              variant="labelMedium"
              style={{ fontWeight: "bold", color: textColor, marginTop: 8, marginBottom: 2, letterSpacing: 0.5 }}
            >
              {trimmed}
            </Text>
          );
        }

        return (
          <Text
            key={index}
            variant="bodySmall"
            style={{ lineHeight: 20, color: textColor, marginBottom: 2 }}
          >
            {trimmed}
          </Text>
        );
      })}
    </>
  );
}

export const TermsModal = ({ visible, onAccept, onDismiss }: TermsModalProps) => {
  const theme = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const loadTerms = async () => {
    setLoading(true);
    setError(null);
    try {
      authLog.info("[TermsModal] Fetching terms content");
      const text = await fetchTermsContent();
      setContent(text);
      authLog.info("[TermsModal] Terms content loaded");
    } catch {
      authLog.warn("[TermsModal] Failed to load terms content");
      setError("Failed to load Terms & Conditions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      setHasScrolledToBottom(false);
      return;
    }
    if (content !== null) return;
    loadTerms();
  }, [visible]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasScrolledToBottom) return;
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) {
      setHasScrolledToBottom(true);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.background,
          margin: 16,
          borderRadius: 10,
          padding: 24,
          maxHeight: "85%",
          flex: 1,
        }}
      >
        <Text variant="titleLarge" style={{ fontWeight: "bold", marginBottom: 4 }}>
          Terms & Conditions
        </Text>
        <Divider style={{ marginBottom: 12 }} />

        {loading && (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={{ marginVertical: 32 }}
          />
        )}

        {error && !loading && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.error, marginBottom: 12 }}>
              {error}
            </Text>
            <Button mode="outlined" onPress={loadTerms}>
              Retry
            </Button>
          </View>
        )}

        {!loading && !error && content && (
          <ScrollView
            style={{ flex: 1, marginBottom: 8 }}
            showsVerticalScrollIndicator
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            <TermsContent content={content} textColor={theme.colors.onBackground} />
          </ScrollView>
        )}

        {content && !hasScrolledToBottom && (
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.outline, textAlign: "center", marginBottom: 8 }}
          >
            Scroll to the bottom to accept
          </Text>
        )}

        <Divider style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
          <Button mode="outlined" onPress={onDismiss}>
            Decline
          </Button>
          <Button
            mode="contained"
            onPress={onAccept}
            disabled={loading || !!error || !content || !hasScrolledToBottom}
          >
            Accept
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};
