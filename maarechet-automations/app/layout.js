// app/_layout.js
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "כניסה" }} />
      <Stack.Screen name="register" options={{ title: "הרשמה" }} />
      <Stack.Screen name="send" options={{ title: "שליחת הודעות" }} />
            <Stack.Screen name="privacy" options={{ title: "תנאים ומימוש" }} />
            <Stack.Screen name="ServersDashboardScreen" options={{ title: "שרתים" }} />

    </Stack>
  );
}
