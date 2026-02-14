import { getItemAsync, setItemAsync } from "expo-secure-store";
import uuid from "react-native-uuid";
import { Peer } from "../database";
import { SessionStore, UserStore } from "../stores";
import { PeerService } from "./peer-service";

/**
 * UserService manages user initialization, user identity, and user persistence in the app.
 * It ensures a user exists in the database and is available in the session and user stores.
 */
export class UserService {
  /**
   * Constructs a UserService instance.
   * @param userStore Store for the current user
   * @param peerService Service for peer management
   * @param sessionStore Store for session state
   */
  constructor(
    private userStore: UserStore,
    private peerService: PeerService,
    private sessionStore: SessionStore
  ) {}

  /**
   * Initializes the user for the current session. Ensures a user UUID exists, creates or fetches the user in the database,
   * and stores the user in the user store.
   * @returns Promise<void>
   */
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
      if (!foundUser) {
        // if current user is not in the peers table, create current user
        const username = this.generateUsername();
        user = await this.peerService.createUser(id, username);
      } else {
        user = foundUser;
      }

      // store the user's peer object
      this.userStore.setUser(user);
    } catch (error) {
      console.error("[UserService]: Error initializing user:", error);
      throw error;
    }
  }

  /**
   * Generates a random username for the user. Will be replaced by authentication in the future.
   * @returns string The generated username
   */
  private generateUsername(): string {
    try {
      return `User_${Math.random().toString(36).substring(7)}`;
    } catch (error) {
      console.error("[UserService]: generating username:", error);
      throw error;
    }
  }
}
