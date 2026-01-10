import { setItemAsync, getItemAsync } from "expo-secure-store";
import uuid from "react-native-uuid";

const getUserUUID = async () => {
  try {
    let id = await getItemAsync("userUUID");
    if (!id) {
      id = uuid.v4();
      await setItemAsync("userUUID", id);
    }

    return id;
  } catch (error) {
    console.error("Error getting user UUID:", error);
  }
};

export default getUserUUID;
