import { View, Text, Pressable } from "react-native";
import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallService } from "@/features/shared/hooks";
import { MediaStream, RTCView } from "react-native-webrtc";

// TODO: This component can minimized
const CallRoom = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const callService = useCallService();
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStream, setRemoteStream] = useState<MediaStream>();

  useEffect(() => {
    setLocalStream(callService.getLocalCam(id as string));
    return () => {
      callService.terminateCallConnection(id as string);
    };
  }, [callService, id]);

  useEffect(() => {
    callService.listenToRemoteStream();

    const handler = (stream: MediaStream) => {
      console.log("remote trigs", stream);
      setRemoteStream(stream);
    };

    callService.on("remoteStream", handler);

    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

  const handleEndCall = async () => {
    await callService.terminateCallConnection(id as string);
    router.back();
  };

  const handleToggleMic = async () => {
    try {
      callService.toggleMic(id as string);
      setMic(!mic);
    } catch (error) {
      console.warn(error);
    }
  };

  const hanldeToggleCam = async () => {
    try {
      callService.toggleCamera(id as string);
      setCam(!cam);
    } catch (error) {
      console.warn(error);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Text>CallRoom {id}</Text>
      <Pressable onPress={handleEndCall}>
        <Text>End call</Text>
      </Pressable>
      <Pressable onPress={handleToggleMic}>
        <Text>Toggle microphone</Text>
      </Pressable>
      <Pressable onPress={hanldeToggleCam}>
        <Text>Toggle camera</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            mirror={true}
            objectFit="cover"
            zOrder={0}
            style={{ flex: 1, backgroundColor: "black" }}
          />
        ) : (
          <Text>No remote stream</Text>
        )}
      </View>
      <Text>Hello</Text>
      <View style={{ flex: 1 }}>
        {localStream ? (
          <RTCView
            mirror={true}
            objectFit="cover"
            zOrder={0}
            streamURL={localStream.toURL()}
            style={{ flex: 1, backgroundColor: "black" }}
          />
        ) : (
          <Text>No local stream</Text>
        )}
      </View>
    </View>
  );
};

export default CallRoom;
