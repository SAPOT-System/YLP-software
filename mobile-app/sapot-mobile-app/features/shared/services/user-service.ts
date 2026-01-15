import { UserStore } from "../stores/user-store";

export class UserService {
  constructor(private userStore: UserStore) {}

  async initialize() {
    const username = this.generateUsername();
    this.userStore.setUsername(username);
  }

  private generateUsername(): string {
    return `User_${Math.random().toString(36).substring(7)}`;
  }
}
