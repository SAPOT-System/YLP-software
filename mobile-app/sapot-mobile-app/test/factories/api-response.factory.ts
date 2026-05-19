import { createFactory } from "../builders/factory.builder";

export interface TestUserProfileResponse {
  data: {
    username: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    email: string;
    id: string;
    email_verified: boolean;
    phone_verified: boolean;
  };
}

export interface TestPingResponse {
  data: {
    status: string;
    timestamp: number;
  };
}

export const createTestUserProfileResponse =
  createFactory<TestUserProfileResponse>(() => ({
    data: {
      username: "alice",
      first_name: "Alice",
      last_name: "Liddell",
      phone_number: "+10000000000",
      email: "alice@example.com",
      id: "user-1",
      email_verified: false,
      phone_verified: false,
    },
  }));

export const createTestPingResponse = createFactory<TestPingResponse>(() => ({
  data: {
    status: "ok",
    timestamp: 1700000000000,
  },
}));
