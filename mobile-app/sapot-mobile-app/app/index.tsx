import { Text, View } from "@/components/Themed";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

const Index = () => {
  const router = useRouter();

  return (
    <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      <View
        style={{
          width: 265,
          height: 265,
          borderRadius: 150,
          borderWidth: 1,
          borderColor: "#D9D9D9",
          backgroundColor: "transparent",
          justifyContent: "center",
          marginBottom: 24,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 215,
            height: 215,
            borderRadius: 110,
            borderWidth: 1,
            borderColor: "#D9D9D9",
            backgroundColor: "transparent",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Image
            source={require("../assets/images/logo.png")}
            style={{ width: 100, height: 100, resizeMode: "contain" }}
          />
          <Text style={{ fontSize: 24, fontWeight: "bold", color: "black" }}>
            SAPOT
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "bold", textAlign: "center" }}>
        Reliable local and internet messaging
      </Text>

      <LinearGradient
        colors={["#696969", "#606060"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 30,
          marginTop: 32,
        }}
      >
        <Pressable
          onPress={() => router.push("/getting-started")}
          style={{
            paddingLeft: 34,
            paddingRight: 3,
            paddingVertical: 3,
            borderRadius: 30,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "medium",
                fontSize: 13,
              }}
            >
              Get Started
            </Text>
            <View
              style={{
                backgroundColor: "white",
                height: 43,
                width: 43,
                borderRadius: 22,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {/* TODO: change the icon to a lighter one. Probably use another library */}
              <FontAwesome name="arrow-right" size={24} />
            </View>
          </View>
        </Pressable>
      </LinearGradient>
    </View>
  );
};

export default Index;
