import Reactotron from "reactotron-react-native";

if (__DEV__) {
  Reactotron.configure({
    name: "SAPOT",
    host: "192.168.1.17",
  })
    .useReactNative({
      networking: {
        ignoreUrls: /\/logs$/,
      },
    })
    .connect();

  Reactotron.log?.("[reactotron] configured");
}

export default Reactotron;
