import * as Updates from "expo-updates";

export const getApiUrl = () => {
  if (__DEV__) {
    return "http://10.0.2.2:8000";
  }

  const channel = Updates.channel;

  switch (channel) {
    case "preview":
      return "https://ylp-software.onrender.com";

    case "production":
      return "https://ylp-software.onrender.com";

    default:
      return "http://10.0.2.2:8000";
  }
};
