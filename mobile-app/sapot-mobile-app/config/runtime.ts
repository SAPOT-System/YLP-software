import * as Updates from "expo-updates";

const DEV_PORT = "8000";
const DEV_HOST = "192.168.1.22";
const STAGING_HOST = "sapot.online";

export const getApiUrl = () => {
  if (__DEV__) {
    console.log("dev");
    return `http://${DEV_HOST}:${DEV_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      console.log("preview");
      return `https://${STAGING_HOST}`;

    case "production":
      return `https://${STAGING_HOST}`;

    default:
      return `http://${DEV_HOST}:${DEV_PORT}`;
  }
};

export const getWsUrl = () => {
  if (__DEV__) {
    return `ws://${DEV_HOST}:${DEV_PORT}`;
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return `wss://${STAGING_HOST}`;

    case "production":
      return `wss://${STAGING_HOST}`;

    default:
      return `ws://${DEV_HOST}:${DEV_PORT}`;
  }
};
