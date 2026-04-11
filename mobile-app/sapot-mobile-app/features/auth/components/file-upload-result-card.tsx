import { authLog } from "@/features/shared/utils/logger";
import React from "react";
import { Text, View } from "react-native";
import { Button, Icon, useTheme } from "react-native-paper";

interface FileUploadResultCardProps {
  fileName: string;
  onDelete: () => void;
}

export const FileUploadResultCard = ({
  fileName,
  onDelete,
}: FileUploadResultCardProps) => {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.secondary,
        paddingHorizontal: 20,
        paddingVertical: 10,
        flexDirection: "row",
        borderRadius: 10,
        gap: 4,
      }}
    >
      <View style={{ padding: 4 }}>
        <Icon
          source="account-file-text"
          size={40}
          color={theme.colors.onSecondary}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flex: 1,
        }}
      >
        <Text style={{ color: theme.colors.onSecondary }}>{fileName}</Text>
        <Button
          mode="text"
          onPress={() => {
            authLog.debug("[FileUploadResultCard] onPress triggered", {
              fileName,
            });
            onDelete();
          }}
        >
          <Icon source="trash-can" size={20} color={theme.colors.onSecondary} />
        </Button>
      </View>
    </View>
  );
};
