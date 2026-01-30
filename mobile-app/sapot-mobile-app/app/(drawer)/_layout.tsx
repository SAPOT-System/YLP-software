import { Drawer } from "expo-router/drawer";
import { ContainerProvider } from "@/features/shared/hooks";

export default function DrawerLayout() {
  return (
    <ContainerProvider>
      <Drawer>
        <Drawer.Screen
          name="(tabs)"
          options={{
            drawerLabel: "Home",
            title: "SAPOT",
            // headerShown: false,
          }}
        />
        <Drawer.Screen
          name="theme"
          options={{
            drawerLabel: "Theme",
            title: "Theme",
          }}
        />
      </Drawer>
    </ContainerProvider>
  );
}
