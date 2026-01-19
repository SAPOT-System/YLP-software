import { PeerService } from "@/features/chat";
import { SessionStore, UserStore } from "../stores";
import uuid from "react-native-uuid";
import { getItemAsync, setItemAsync } from "expo-secure-store";
import { Peer } from "../database";

export class UserService {
  constructor(
    private userStore: UserStore,
    private peerService: PeerService,
    private sessionStore: SessionStore
  ) {}

  async initialize() {
    try {
      let id = await getItemAsync("userUUID");
      if (!id) {
        id = uuid.v4();
        await setItemAsync("userUUID", id);
      }
      this.sessionStore.setUserId(id);

      // find the current user in the peers table
      const foundUser = await this.peerService.findPeerById(id);
      let user: Peer;
      if (foundUser.length <= 0) {
        // if current user is not in the peers table, create current user
        const username = this.generateUsername();
        user = await this.peerService.createUser(id, username);
      } else {
        user = foundUser[0];
      }

      // store the user's peer object
      this.userStore.setUser(user);
    } catch (error) {
      console.error("Error initializing user:", error);
      throw error;
    }
  }

  // Note that this will be edited soon when authentication feature is applied
  private generateUsername(): string {
    return `User_${Math.random().toString(36).substring(7)}`;
  }
}
