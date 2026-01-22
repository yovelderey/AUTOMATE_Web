import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  ImageBackground,
  useColorScheme,
  LayoutAnimation,
  UIManager
} from "react-native";

import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
import { useRouter, Stack } from "expo-router";

import { auth, db } from "../src/firebase";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// הפעלת אנימציות באנדרואיד
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- הגדרת ערכות נושא (זהה ללוגין) ---
const themeColors = {
  light: {
    mainBgSolid: "#ffffff",
    cardBg: "#ffffff",
    cardBorder: "#e2e8f0",
    textColor: "#0f172a",
    subText: "#64748b",
    inputBg: "#f8fafc",
    inputBorder: "#cbd5e1",
    inputIconColor: "#94a3b8",
    shadowColor: "#64748b",
    overlayColors: ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.6)"],
    recaptchaBg: "#f1f5f9"
  },
  dark: {
    mainBgSolid: "#020617",
    cardBg: "rgba(30, 41, 59, 0.4)",
    cardBorder: "rgba(255, 255, 255, 0.05)",
    textColor: "#f8fafc",
    subText: "#94a3b8",
    inputBg: "#0f172a",
    inputBorder: "#1e293b",
    inputIconColor: "#64748b",
    shadowColor: "#000000",
    overlayColors: ["rgba(2, 6, 23, 0.6)", "#020617"],
    recaptchaBg: "#0f172a"
  }
};

export default function Register() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  
  // אנימציה אוטומטית בעת החלפת Theme
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [colorScheme]);

  const theme = themeColors[colorScheme === 'light' ? 'light' : 'dark'];
  const isDesktop = width > 900;

  // --- States ---
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false); // תנאי שימוש
  
  // States ל"אני לא רובוט"
  const [isHuman, setIsHuman] = useState(false);
  const [verifyingHuman, setVerifyingHuman] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  // Focus States
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Animations
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

  const onlyDigits = (s) => String(s || "").replace(/[^\d]/g, "");

  // --- לוגיקת "אני לא רובוט" ---
  const handleHumanVerify = () => {
    if (isHuman) return; // כבר אומת
    setVerifyingHuman(true);
    Haptics.selectionAsync();

    // סימולציה של בדיקת שרת (1.5 שניות)
    setTimeout(() => {
      setVerifyingHuman(false);
      setIsHuman(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1500);
  };

  const handleRegister = async () => {
    setErrorMsg("");
    const cleanName = fullName.trim();
    const cleanPhone = onlyDigits(phone);
    const cleanEmail = email.trim().toLowerCase();

    // בדיקות תקינות
    if (!cleanName || !cleanPhone || !cleanEmail || !pass) {
      setErrorMsg("אנא מלא את כל השדות");
      triggerShake();
      return;
    }
    if (String(pass).length < 6) {
      setErrorMsg("הסיסמה חייבת להכיל לפחות 6 תווים");
      triggerShake();
      return;
    }
    if (!isHuman) {
      setErrorMsg("אנא אמת שאינך רובוט");
      triggerShake();
      return;
    }
    if (!accepted) {
      setErrorMsg("חובה לאשר את תנאי השימוש");
      triggerShake();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      setLoading(true);

      // יצירה ב-Auth
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const uid = cred.user.uid;

      // שמירה ב-DB
      await set(ref(db, `users/${uid}`), {
        uid,
        name: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        acceptedTerms: true,
        acceptedAt: new Date().toISOString(),
        role: "owner",
        plan: "free",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });

      router.replace("/send");
    } catch (e) {
      setErrorMsg(e?.message || "הרשמה נכשלה");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  // --- Gradient Transition Component ---
  const TransitionGradient = () => {
    const style = isDesktop 
      ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: 200, zIndex: 2 }
      : { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, zIndex: 2 };
    
    const start = isDesktop ? { x: 0, y: 0.5 } : { x: 0.5, y: 1 };
    const end = isDesktop ? { x: 1, y: 0.5 } : { x: 0.5, y: 0 };

    return (
      <LinearGradient
        colors={[theme.mainBgSolid, 'transparent']} 
        start={start} end={end} style={style}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.mainBgSolid }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[s.contentWrapper, { flexDirection: isDesktop ? "row" : "column-reverse" }]}>
          
          {/* --- LEFT SIDE: FORM --- */}
          <View style={[s.leftSide, { width: isDesktop ? "40%" : "100%", backgroundColor: theme.mainBgSolid }]}>
             <ScrollView 
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
             >
                <Animated.View style={[
                    s.formCard, 
                    { 
                        backgroundColor: theme.cardBg, 
                        borderColor: theme.cardBorder,
                        shadowColor: theme.shadowColor,
                        opacity: fadeAnim, 
                        transform: [{ translateY: slideAnim }, { translateX: shakeAnim }] 
                    }
                ]}>
                    
                    <View style={s.headerContainer}>
                        <View style={s.iconBg}>
                            <Ionicons name="person-add-outline" size={32} color="#3b82f6" />
                        </View>
                        <Text style={[s.h1, { color: theme.textColor }]}>יצירת חשבון</Text>
                        <Text style={[s.subHeader, { color: theme.subText }]}>הצטרף למהפכת האוטומציה</Text>
                    </View>

                    {/* Inputs Grid */}
                    <View style={s.inputsStack}>
                        {/* שם */}
                        <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, focusedField==='name' && s.inputFocused]}>
                            <Ionicons name="person-outline" size={20} color={focusedField==='name' ? "#3b82f6" : theme.inputIconColor} style={s.inputIcon} />
                            <TextInput 
                                value={fullName} onChangeText={setFullName} 
                                placeholder="שם מלא" placeholderTextColor={theme.subText}
                                style={[s.input, {color: theme.textColor}]}
                                onFocus={()=>setFocusedField('name')} onBlur={()=>setFocusedField(null)}
                            />
                        </View>

                        {/* טלפון */}
                        <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, focusedField==='phone' && s.inputFocused]}>
                            <Ionicons name="call-outline" size={20} color={focusedField==='phone' ? "#3b82f6" : theme.inputIconColor} style={s.inputIcon} />
                            <TextInput 
                                value={phone} onChangeText={t => setPhone(onlyDigits(t))} 
                                placeholder="טלפון" placeholderTextColor={theme.subText}
                                keyboardType="phone-pad"
                                style={[s.input, {color: theme.textColor}]}
                                onFocus={()=>setFocusedField('phone')} onBlur={()=>setFocusedField(null)}
                            />
                        </View>

                        {/* אימייל */}
                        <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, focusedField==='email' && s.inputFocused]}>
                            <Ionicons name="mail-outline" size={20} color={focusedField==='email' ? "#3b82f6" : theme.inputIconColor} style={s.inputIcon} />
                            <TextInput 
                                value={email} onChangeText={setEmail} 
                                placeholder="אימייל" placeholderTextColor={theme.subText}
                                autoCapitalize="none" keyboardType="email-address"
                                style={[s.input, {color: theme.textColor}]}
                                onFocus={()=>setFocusedField('email')} onBlur={()=>setFocusedField(null)}
                            />
                        </View>

                        {/* סיסמה */}
                        <View style={[s.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }, focusedField==='pass' && s.inputFocused]}>
                            <Ionicons name="lock-closed-outline" size={20} color={focusedField==='pass' ? "#3b82f6" : theme.inputIconColor} style={s.inputIcon} />
                            <TextInput 
                                value={pass} onChangeText={setPass} 
                                placeholder="סיסמה (6+ תווים)" placeholderTextColor={theme.subText}
                                secureTextEntry={!showPassword}
                                style={[s.input, {color: theme.textColor}]}
                                onFocus={()=>setFocusedField('pass')} onBlur={()=>setFocusedField(null)}
                            />
                            <TouchableOpacity onPress={()=>setShowPassword(!showPassword)}>
                                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.inputIconColor} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* --- I'M NOT A ROBOT (RECAPTCHA STYLE) --- */}
                    <TouchableOpacity 
                        activeOpacity={0.9} 
                        onPress={handleHumanVerify}
                        style={[s.recaptchaContainer, { backgroundColor: theme.recaptchaBg, borderColor: theme.inputBorder }]}
                    >
                        <View style={[s.recaptchaBox, isHuman && { borderColor: "transparent", backgroundColor: "transparent" }]}>
                            {verifyingHuman ? (
                                <ActivityIndicator size="small" color="#3b82f6" />
                            ) : isHuman ? (
                                <Ionicons name="checkmark-circle" size={28} color="#10b981" />
                            ) : null}
                        </View>
                        <Text style={[s.recaptchaText, { color: theme.textColor }]}>אני לא רובוט</Text>
                        <View style={s.recaptchaLogo}>
                           <Ionicons name="shield-checkmark-outline" size={24} color={theme.subText} />
                           <Text style={[s.recaptchaSmall, {color: theme.subText}]}>reCAPTCHA</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Terms */}
                    <TouchableOpacity 
                        activeOpacity={0.8} style={s.termsRow}
                        onPress={()=>setAccepted(!accepted)}
                    >
                        <View style={[s.checkbox, accepted && s.checkboxOn, { borderColor: theme.inputBorder }]}>
                            {accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <Text style={[s.termsText, { color: theme.subText }]}>
                            אני מאשר/ת את <Text style={s.termsLink} onPress={()=>router.push("/terms")}>תנאי השימוש</Text>
                        </Text>
                    </TouchableOpacity>

                    {/* Error Msg */}
                    {errorMsg ? (
                        <View style={s.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color="#ef4444" />
                            <Text style={s.errorText}>{errorMsg}</Text>
                        </View>
                    ) : null}

                    {/* Submit */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={s.btnWrapper}
                        disabled={loading}
                        onPress={handleRegister}
                    >
                        <LinearGradient
                            colors={loading ? ["#334155", "#1e293b"] : ["#3b82f6", "#2563eb"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={s.btn}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>הרשמה</Text>}
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.footerLink} onPress={() => router.replace("/login")}>
                        <Text style={[s.linkText, {color: theme.subText}]}>
                            כבר יש לך חשבון? <Text style={s.linkHighlight}>התחבר כאן</Text>
                        </Text>
                    </TouchableOpacity>

                </Animated.View>
             </ScrollView>
          </View>

          {/* --- RIGHT SIDE: IMAGE --- */}
          <View style={[s.rightSide, { width: isDesktop ? "60%" : "100%", height: isDesktop ? "100%" : 220 }]}>
             <ImageBackground
                source={{ uri: "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2070&auto=format&fit=crop" }} // תמונה של Teamwork/Startup
                style={s.bgImage}
                resizeMode="cover"
             >
                <TransitionGradient />
                <LinearGradient colors={theme.overlayColors} style={s.overlay}>
                    <View style={s.marketingContent}>
                        <Text style={s.marketingTitle}>JOIN US</Text>
                        <View style={s.divider} />
                        <Text style={[s.marketingText, { color: "#f1f5f9", textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10 }]}>
                           הצטרף לאלפי עסקים שמנהלים את האוטומציה שלהם בצורה חכמה.
                           צור חשבון והתחל בחינם.
                        </Text>
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
  contentWrapper: { flex: 1 },
  
  // Left Side
  leftSide: { justifyContent: "center", zIndex: 3 },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24, alignItems: "center" },
  formCard: {
    width: "100%", maxWidth: 440,
    padding: 32, borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
  },
  
  headerContainer: { alignItems: "center", marginBottom: 24 },
  iconBg: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 14, borderWidth: 1, borderColor: "rgba(59, 130, 246, 0.2)"
  },
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 4 },
  subHeader: { fontSize: 14 },

  // Inputs
  inputsStack: { gap: 12, marginBottom: 16 },
  inputContainer: {
    flexDirection: "row-reverse", alignItems: "center",
    borderRadius: 12, height: 50, borderWidth: 1, paddingHorizontal: 12
  },
  inputFocused: { borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.05)" },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, fontSize: 15, textAlign: "right", height: "100%" },

  // RECAPTCHA STYLES
  recaptchaContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    height: 70
  },
  recaptchaBox: {
    width: 28, height: 28,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12
  },
  recaptchaText: { flex: 1, fontSize: 14, fontWeight: "500", textAlign: "right" },
  recaptchaLogo: { alignItems: "center", justifyContent: "center", opacity: 0.8 },
  recaptchaSmall: { fontSize: 9, fontWeight: "700", marginTop: 2 },

  // Checkbox (Terms)
  termsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 16 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent"
  },
  checkboxOn: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  termsText: { flex: 1, fontSize: 13, textAlign: "right", lineHeight: 18 },
  termsLink: { color: "#3b82f6", fontWeight: "700" },

  // Error
  errorContainer: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    marginBottom: 16, padding: 8, borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)", gap: 6
  },
  errorText: { color: "#ef4444", fontSize: 13, fontWeight: "600" },

  // Button
  btnWrapper: { shadowColor: "#3b82f6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "white", fontWeight: "700", fontSize: 16 },

  footerLink: { marginTop: 18, alignItems: "center" },
  linkText: { fontSize: 14 },
  linkHighlight: { color: "#3b82f6", fontWeight: "700" },

  // Right Side
  rightSide: { position: "relative" },
  bgImage: { flex: 1, width: "100%", height: "100%" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, zIndex: 1 },
  marketingContent: { maxWidth: 500, alignItems: "center" },
  marketingTitle: { fontSize: 48, fontWeight: "900", color: "#fff", letterSpacing: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 0, height: 4}, textShadowRadius: 10 },
  divider: { width: 60, height: 4, backgroundColor: "#3b82f6", marginVertical: 20, borderRadius: 2 },
  marketingText: { fontSize: 18, textAlign: "center", lineHeight: 28, fontWeight: "400" },
});