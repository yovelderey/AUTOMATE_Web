import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  ImageBackground,
  useColorScheme,
  LayoutAnimation, // הוספתי עבור אנימציית המעבר
  UIManager // נדרש לאנדרואיד
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter, Stack } from "expo-router";
import { auth } from "../src/firebase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// הפעלת מנוע האנימציה באנדרואיד
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// הגדרת פלטת צבעים דרמטית בין אור לחושך
const themeColors = {
  light: {
    // צד שמאל - לבן נקי לחלוטין
    mainBgSolid: "#ffffff", 
    
    // כרטיס הטופס - כמעט שקוף או לבן עם צל עדין
    cardBg: "#ffffff", 
    cardBorder: "#e2e8f0", // גבול אפור עדין
    
    textColor: "#0f172a", // טקסט שחור/כחול כהה
    subText: "#64748b",   // טקסט משני אפור
    
    inputBg: "#f8fafc",   // רקע שדות - לבן אפרפר
    inputBorder: "#cbd5e1", // גבול שדות
    inputIconColor: "#94a3b8",
    
    shadowColor: "#64748b", // צבע לצללית בבהיר
    
    // צד ימין (תמונה) - אוברליי בהיר יותר
    overlayColors: ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.6)"] 
  },
  dark: {
    // צד שמאל - כחול עמוק/שחור (Cyber)
    mainBgSolid: "#020617",
    
    cardBg: "rgba(30, 41, 59, 0.4)",
    cardBorder: "rgba(255, 255, 255, 0.05)",
    
    textColor: "#f8fafc", // טקסט לבן
    subText: "#94a3b8",   // טקסט משני כסוף
    
    inputBg: "#0f172a",
    inputBorder: "#1e293b",
    inputIconColor: "#64748b",
    
    shadowColor: "#000000",
    
    // צד ימין (תמונה) - אוברליי כהה המשתלב עם הרקע
    overlayColors: ["rgba(2, 6, 23, 0.6)", "#020617"] 
  }
};

export default function Login() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  
  // אנימציה אוטומטית בעת החלפת Theme
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [colorScheme]);

  // בחירת הפלטה הנוכחית
  const theme = themeColors[colorScheme === 'light' ? 'light' : 'dark'];
  const isDesktop = width > 900;

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPassFocused, setIsPassFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // אנימציות כניסה (Fade In, Slide Up, Shake)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    setErrorMsg("");
    if (!email || !pass) {
        setErrorMsg("אנא מלא אימייל וסיסמה");
        triggerShake();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      router.replace("/send");
    } catch (e) {
      setErrorMsg("שם המשתמש או הסיסמה שגויים");
      triggerShake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  // קומפוננטה לגרדיאנט המעבר - משתנה לפי צבע הרקע של התמה
  const TransitionGradient = () => {
    const style = isDesktop 
      ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: 200, zIndex: 2 }
      : { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, zIndex: 2 };
    
    const start = isDesktop ? { x: 0, y: 0.5 } : { x: 0.5, y: 1 };
    const end = isDesktop ? { x: 1, y: 0.5 } : { x: 0.5, y: 0 };

    return (
      <LinearGradient
        // המפתח פה הוא theme.mainBgSolid - הוא דואג שהגרדיאנט יתחיל בדיוק בצבע של הצד השמאלי
        colors={[theme.mainBgSolid, 'transparent']} 
        start={start}
        end={end}
        style={style}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.mainBgSolid }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={[s.contentWrapper, { flexDirection: isDesktop ? "row" : "column-reverse" }]}>
          
          {/* --- Left Side (Form) --- */}
          {/* הרקע כאן נקבע דינמית לפי התמה (לבן או שחור) */}
          <View style={[s.leftSide, { width: isDesktop ? "40%" : "100%", backgroundColor: theme.mainBgSolid }]}>
            <ScrollView 
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={[
                  s.formCard,
                  { 
                    backgroundColor: theme.cardBg,
                    borderColor: theme.cardBorder,
                    shadowColor: theme.shadowColor,
                    opacity: fadeAnim, 
                    transform: [{ translateY: slideAnim }, { translateX: shakeAnim }] 
                  },
                ]}
              >
                <View style={s.headerContainer}>
                  <View style={s.iconBg}>
                    <Ionicons name="finger-print-outline" size={36} color="#3b82f6" />
                  </View>
                  <Text style={[s.h1, { color: theme.textColor }]}>כניסה למערכת</Text>
                  <Text style={[s.subHeader, { color: theme.subText }]}>הזן פרטים כדי להתחבר</Text>
                </View>

                {/* Input Email */}
                <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, isEmailFocused && s.inputFocused, errorMsg && s.inputError]}>
                  <Ionicons name="mail-outline" size={20} color={errorMsg ? "#ef4444" : (isEmailFocused ? "#3b82f6" : theme.inputIconColor)} style={s.inputIcon} />
                  <TextInput
                    value={email}
                    onChangeText={(t) => { setEmail(t); setErrorMsg(""); }}
                    placeholder="אימייל"
                    placeholderTextColor={theme.subText}
                    autoCapitalize="none"
                    style={[s.input, { color: theme.textColor }]}
                    onFocus={() => setIsEmailFocused(true)}
                    onBlur={() => setIsEmailFocused(false)}
                  />
                </View>

                {/* Input Password */}
                <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, isPassFocused && s.inputFocused, errorMsg && s.inputError]}>
                  <Ionicons name="lock-closed-outline" size={20} color={errorMsg ? "#ef4444" : (isPassFocused ? "#3b82f6" : theme.inputIconColor)} style={s.inputIcon} />
                  <TextInput
                    value={pass}
                    onChangeText={(t) => { setPass(t); setErrorMsg(""); }}
                    placeholder="סיסמה"
                    placeholderTextColor={theme.subText}
                    secureTextEntry={!showPassword}
                    style={[s.input, { color: theme.textColor }]}
                    onFocus={() => setIsPassFocused(true)}
                    onBlur={() => setIsPassFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.inputIconColor} />
                  </TouchableOpacity>
                </View>

                {/* Remember Me */}
                <TouchableOpacity 
                  style={s.rememberMeContainer} 
                  activeOpacity={0.8}
                  onPress={() => setRememberMe(!rememberMe)}
                >
                  <View style={[s.checkbox, rememberMe && s.checkboxChecked, { borderColor: theme.inputBorder }]}>
                    {rememberMe && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={[s.rememberMeText, { color: theme.subText }]}>שמור את ההתחברות שלי</Text>
                </TouchableOpacity>

                {/* Error Msg */}
                {errorMsg ? (
                  <View style={s.errorContainer}>
                      <Ionicons name="warning-outline" size={16} color="#ef4444" />
                      <Text style={s.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                {/* Submit Button */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={s.btnWrapper}
                  disabled={loading}
                  onPress={handleLogin}
                >
                  <LinearGradient
                    colors={loading ? ["#334155", "#1e293b"] : ["#3b82f6", "#2563eb"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.btn}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>התחבר</Text>}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.footerLink} onPress={() => router.replace("/register")}>
                  <Text style={[s.linkText, { color: theme.subText }]}>אין לך חשבון? <Text style={s.linkHighlight}>הירשם</Text></Text>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </View>

          {/* --- Right Side (Image) --- */}
          <View style={[s.rightSide, { width: isDesktop ? "60%" : "100%", height: isDesktop ? "100%" : 300 }]}>
              <ImageBackground
                source={{ uri: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop" }}
                style={s.bgImage}
                resizeMode="cover"
              >
                {/* 1. גרדיאנט המעבר (Blending) שמתמזג עם הצבע השמאלי */}
                <TransitionGradient />

                {/* 2. אוברליי כללי על התמונה כדי שהטקסט יהיה קריא */}
                <LinearGradient
                  colors={theme.overlayColors} 
                  style={s.overlay}
                >
                    <View style={s.marketingContent}>
                      <Text style={s.marketingTitle}>AUTOMATE</Text>
                      <View style={s.divider} />
                      {/* ב-Light mode הטקסט על התמונה צריך להישאר קריא, אז נשתמש בצבע בהיר או כהה בהתאם לקונטרסט */}
                      <Text style={[s.marketingText, { color: "#f1f5f9", textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 }]}>
                          מערכת ניהול מתקדמת לאוטומציה ושיווק.
                          שלוט בקמפיינים שלך, נהל נמענים וצפה בסטטיסטיקות בזמן אמת.
                      </Text>
                      
                      <View style={s.featureBadges}>
                          <View style={s.badge}><Text style={s.badgeTxt}>Analytics</Text></View>
                          <View style={s.badge}><Text style={s.badgeTxt}>Automation</Text></View>
                          <View style={s.badge}><Text style={s.badgeTxt}>Security</Text></View>
                      </View>
                    </View>
                </LinearGradient>
              </ImageBackground>
          </View>

        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  mainContainer: { flex: 1 },
  contentWrapper: { flex: 1 },

  leftSide: {
    justifyContent: "center",
    zIndex: 3, 
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    alignItems: "center", 
  },
  formCard: {
    width: "100%",
    maxWidth: 420,
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    // צללית עדינה שתעבוד גם בלבן וגם בשחור
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  headerContainer: { alignItems: "center", marginBottom: 32 },
  iconBg: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "rgba(59, 130, 246, 0.2)"
  },
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 6 },
  subHeader: { fontSize: 14 },

  inputContainer: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12,
    height: 54, marginBottom: 16,
    borderWidth: 1,
    paddingHorizontal: 12
  },
  inputFocused: { borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.05)" },
  inputError: { borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.05)" },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, fontSize: 15, textAlign: "right", height: "100%" },

  rememberMeContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  checkboxChecked: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  rememberMeText: {
    fontSize: 14,
    fontWeight: "500",
  },

  errorContainer: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    marginBottom: 16, padding: 8, borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)", gap: 6
  },
  errorText: { color: "#ef4444", fontSize: 13, fontWeight: "600" },

  btnWrapper: { shadowColor: "#3b82f6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "white", fontWeight: "700", fontSize: 16 },
  
  footerLink: { marginTop: 24, alignItems: "center" },
  linkText: { fontSize: 14 },
  linkHighlight: { color: "#3b82f6", fontWeight: "700" },

  rightSide: { position: "relative" },
  bgImage: { flex: 1, width: "100%", height: "100%" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, zIndex: 1 },
  marketingContent: { maxWidth: 500, alignItems: "center" },
  marketingTitle: { fontSize: 48, fontWeight: "900", color: "#fff", letterSpacing: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 0, height: 4}, textShadowRadius: 10 },
  divider: { width: 60, height: 4, backgroundColor: "#3b82f6", marginVertical: 20, borderRadius: 2 },
  marketingText: { fontSize: 18, textAlign: "center", lineHeight: 28, fontWeight: "400" },
  featureBadges: { flexDirection: "row", gap: 10, marginTop: 30 },
  badge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(0,0,0,0.3)" },
  badgeTxt: { fontSize: 12, fontWeight: "600", color: "#fff" },
});