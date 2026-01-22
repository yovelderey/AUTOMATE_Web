import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function Privacy() {
  const router = useRouter();
  return (
    <View style={s.wrap}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}><Text style={s.backTxt}>חזור</Text></TouchableOpacity>
      <Text style={s.h1}>מדיניות פרטיות</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.p}>כאן נשים את מדיניות הפרטיות שלך…</Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: "#0b1220" },
  back: { alignSelf: "flex-end", padding: 10 },
  backTxt: { color: "#60a5fa", fontWeight: "800" },
  h1: { color: "white", fontSize: 22, fontWeight: "900", marginBottom: 10, textAlign: "right" },
  p: { color: "#cbd5e1", fontSize: 14, lineHeight: 20, textAlign: "right" },
});
