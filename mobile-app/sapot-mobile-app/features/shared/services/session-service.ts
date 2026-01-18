import { getItemAsync, setItemAsync } from "expo-secure-store";
import { SessionStore } from "../stores";
import uuid from "react-native-uuid";

export class SessionService {
  constructor(private store: SessionStore) {}

  async initialize() {
    try {
      let id = await getItemAsync("userUUID");
      if (!id) {
        id = uuid.v4();
        await setItemAsync("userUUID", id);
      }

      this.store.setUserId(id);
    } catch (error) {
      console.error("Error getting user UUID:", error);
      throw error;
    }
  }
}
