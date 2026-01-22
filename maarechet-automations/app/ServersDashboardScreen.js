
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  ScrollView,
  LayoutAnimation,
  UIManager,
  useColorScheme,
} from "react-native";

import {
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

import { auth, db } from "../src/firebase";
import {
  ref,
  onValue,
  update,
  remove,
  set,
  serverTimestamp,
  runTransaction,
} from "firebase/database";

import QRCode from "react-native-qrcode-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";

// Enable LayoutAnimation for Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ================== THEMES ==================
const DARK_THEME = {
  bgGradient: ["#020617", "#0f172a", "#1e1b4b"],
  cardBg: "rgba(30, 41, 59, 0.55)",
  cardBorder: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  accent: "#3b82f6",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  inputBg: "rgba(15, 23, 42, 0.9)",
  headerGlass: "rgba(15, 23, 42, 0.55)",
  modalBg: "#0b1220",
};

const LIGHT_THEME = {
  bgGradient: ["#f8fafc", "#eef2ff", "#fff7ed"],
  cardBg: "rgba(255, 255, 255, 0.92)",
  cardBorder: "rgba(15, 23, 42, 0.12)",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  accent: "#2563eb",
  success: "#059669",
  danger: "#dc2626",
  warning: "#d97706",
  inputBg: "rgba(255, 255, 255, 0.95)",
  headerGlass: "rgba(255, 255, 255, 0.75)",
  modalBg: "#ffffff",
};

const ACTIVE_PULSE_EVERY_MS = 3000;

const SEND_DELAY_OPTIONS = [
  { label: "1 שנ׳", ms: 1000 },
  { label: "3 שנ׳", ms: 3000 },
  { label: "7 שנ׳", ms: 7000 },
  { label: "10 שנ׳", ms: 10000 },
  { label: "15 שנ׳", ms: 15000 },
  { label: "30 שנ׳", ms: 30000 },
  { label: "1 דק׳", ms: 60000 },
  { label: "3 דק׳", ms: 180000 },
  { label: "5 דק׳", ms: 300000 },
];

// ================== HELPERS ==================
function nowISO() {
  return new Date().toISOString();
}
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function normalizeBool(v, def = true) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return def;
}
function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
function tryParseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function formatWhen(v) {
  const d = tryParseDate(v);
  if (!d) return "—";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) return d.toLocaleTimeString();
  return d.toLocaleString();
}
function formatDelay(ms) {
  const n = Number(ms || 0);
  if (!n) return "—";
  if (n < 60000) return `${Math.round(n / 1000)}s`;
  return `${Math.round(n / 60000)}m`;
}

// --- Status Helpers ---
function getStatusMeta(theme, status, state) {
  const s = String(status || "").toLowerCase();
  const st = String(state || "").toLowerCase();

  if (s === "online" && (st.includes("ready") || st === "ready"))
    return { label: "ONLINE", color: theme.success, icon: "wifi" };
  if (s === "disabled") return { label: "DISABLED", color: theme.textSecondary, icon: "pause-circle" };
  if (s === "offline") return { label: "OFFLINE", color: theme.danger, icon: "cloud-offline" };
  if (s === "qr") return { label: "SCAN QR", color: theme.warning, icon: "qr-code" };
  if (s === "authenticated") return { label: "AUTH", color: theme.warning, icon: "shield-half" };
  if (s === "disconnected") return { label: "DISC.", color: theme.danger, icon: "close-circle" };
  if (s === "booting") return { label: "BOOTING", color: theme.accent, icon: "power" };

  return { label: s.toUpperCase().slice(0, 10) || "UNKNOWN", color: theme.textSecondary, icon: "help-circle" };
}

// ================== UI COMPONENTS ==================
function StatusBadge({ theme, meta }) {
  return (
    <View style={[styles.badge, { backgroundColor: meta.color + "20", borderColor: meta.color + "60" }]}>
      <View style={[styles.badgeDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function StatCard({ theme, label, value, icon, color }) {
  return (
    <View style={[styles.statCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
}

function Toast({ toast }) {
  if (!toast?.visible) return null;
  const bgColor = toast.kind === "error" ? "rgba(127, 29, 29, 0.9)" : "rgba(20, 83, 45, 0.9)";
  const borderColor = toast.kind === "error" ? "#f87171" : "#4ade80";

  return (
    <Animated.View style={styles.toastWrap} pointerEvents="none">
      <View style={[styles.toast, { backgroundColor: bgColor, borderColor }]}>
        <Ionicons name={toast.kind === "error" ? "alert-circle" : "checkmark-circle"} size={24} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}>{toast.title}</Text>
          {!!toast.message && <Text style={styles.toastMsg}>{toast.message}</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

// ================== SCREEN ==================
export default function ServersDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const systemScheme = useColorScheme();

  // ====== Theme mode sync (Firebase) ======
  const [themeMode, setThemeMode] = useState("system"); // 'system' | 'dark' | 'light'
  useEffect(() => {
    const themeRef = ref(db, "ui/themeMode"); // 👈 אותו נתיב שתשתמש בו בכל המסכים
    const unsub = onValue(themeRef, (snap) => {
      const v = String(snap.val() || "system").toLowerCase();
      if (v === "dark" || v === "light" || v === "system") setThemeMode(v);
      else setThemeMode("system");
    });
    return () => unsub();
  }, []);

  const isDark = themeMode === "dark" || (themeMode === "system" && systemScheme === "dark");
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  // layout
  const isWide = width >= 900;
  const numColumns = isWide ? 3 : 1;
  const gap = 16;
  const horizontalPad = 20;

  const cardSize = useMemo(() => {
    if (numColumns === 1) {
      const w = Math.min(width - horizontalPad * 2, 520);
      const h = Math.max(175, Math.round(w * 0.62));
      return { w, h };
    }
    const w = Math.floor((width - horizontalPad * 2 - gap * (numColumns - 1)) / numColumns);
    const h = Math.max(175, Math.round(w * 0.74));
    return { w, h };
  }, [width, numColumns]);

  // state
  const [serversMap, setServersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // modals
  const [logsOpen, setLogsOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);

  const [connectServerId, setConnectServerId] = useState(null);
  const [connectServerData, setConnectServerData] = useState(null);

  // toast
  const [toast, setToast] = useState({ visible: false, title: "", message: "", kind: "ok" });
  const toastTimer = useRef(null);

  const showToast = useCallback((title, message = "", kind = "ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ visible: true, title, message, kind });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }, []);

  // ====== Auth + servers listener ======
  useEffect(() => {
    let unsubAuth = null;
    let unsubDb = null;
    let signingIn = false;

    const startServersListener = () => {
      const r = ref(db, "servers");
      if (unsubDb) unsubDb();
      unsubDb = onValue(
        r,
        (snap) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setServersMap(snap.exists() ? snap.val() : {});
          setLoading(false);
        },
        (err) => {
          setServersMap({});
          setLoading(false);
          showToast("שגיאת הרשאות", err?.message, "error");
        }
      );
    };

    setLoading(true);
    unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        startServersListener();
        return;
      }
      if (signingIn) return;
      signingIn = true;
      try {
        if (Platform.OS === "web") await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
      } catch (e) {
        setServersMap({});
        setLoading(false);
        showToast("שגיאת התחברות", e?.message, "error");
      } finally {
        signingIn = false;
      }
    });

    return () => {
      if (unsubDb) unsubDb();
      if (unsubAuth) unsubAuth();
    };
  }, [showToast]);

  // ====== pulse anim for active ======
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: ACTIVE_PULSE_EVERY_MS * 0.5,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: ACTIVE_PULSE_EVERY_MS * 0.5,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // ====== connect modal watcher ======
  useEffect(() => {
    if (!connectOpen || !connectServerId) return;
    const unsub = onValue(
      ref(db, `servers/${connectServerId}`),
      (snap) => setConnectServerData(snap.exists() ? snap.val() : null),
      (err) => showToast("שגיאה", err?.message, "error")
    );
    return () => unsub();
  }, [connectOpen, connectServerId, showToast]);

  // ====== computed arrays ======
  const serversArray = useMemo(() => {
    const arr = Object.keys(serversMap || {}).map((id) => ({ id, ...(serversMap[id] || {}) }));
    const s = search.trim().toLowerCase();
    const filteredBySearch = s
      ? arr.filter(
          (x) =>
            x.id.toLowerCase().includes(s) ||
            String(x.status || "").toLowerCase().includes(s) ||
            String(x.state || "").toLowerCase().includes(s)
        )
      : arr;

    const filtered =
      filter === "all"
        ? filteredBySearch
        : filter === "online"
        ? filteredBySearch.filter((x) => String(x.status || "").toLowerCase() === "online")
        : filter === "disabled"
        ? filteredBySearch.filter((x) => normalizeBool(x.enabled, true) === false || String(x.status || "").toLowerCase() === "disabled")
        : filteredBySearch.filter((x) => String(x.status || "").toLowerCase() !== "online");

    filtered.sort((a, b) => {
      const ao = String(a.status || "").toLowerCase() === "online" ? 0 : 1;
      const bo = String(b.status || "").toLowerCase() === "online" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    });

    return filtered;
  }, [serversMap, search, filter]);

  const kpis = useMemo(() => {
    const arr = Object.keys(serversMap || {}).map((id) => ({ id, ...(serversMap[id] || {}) }));
    const total = arr.length;
    const online = arr.filter((x) => String(x.status || "").toLowerCase() === "online").length;
    const disabled = arr.filter((x) => normalizeBool(x.enabled, true) === false).length;
    const todayK = dayKey(new Date());
    const sentToday = arr.reduce((sum, x) => sum + (String(x.date || "") === todayK ? safeNum(x.count, 0) : 0), 0);
    return { total, online, disabled, sentToday };
  }, [serversMap]);

  const selectedServer = useMemo(() => {
    if (!selectedServerId) return null;
    return { id: selectedServerId, ...(serversMap[selectedServerId] || {}) };
  }, [selectedServerId, serversMap]);

  const isActiveServer = useCallback((srv) => {
    const st = String(srv?.state || "").toLowerCase();
    const status = String(srv?.status || "").toLowerCase();
    return status === "online" && (st === "ready" || st.includes("ready"));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      showToast("רענון בוצע");
    }, 400);
  }, [showToast]);

  const friendlyWriteError = (e) =>
    String(e?.message || "").includes("permission denied")
      ? "חסרה הרשאת כתיבה (Rules)"
      : e?.message || "שגיאה לא ידועה";

  // ================== ACTIONS ==================
  const toggleEnabled = async (id, current) => {
    try {
      const nextEnabled = !normalizeBool(current, true);
      await update(ref(db, `servers/${id}`), {
        enabled: nextEnabled,
        status: nextEnabled ? "online" : "disabled",
        updatedAt: serverTimestamp(),
      });
      showToast(nextEnabled ? "השרת הופעל" : "השרת הושבת", id);
    } catch (e) {
      showToast("שגיאה", friendlyWriteError(e), "error");
    }
  };
const [connectTick, setConnectTick] = useState(0);

useEffect(() => {
  if (!connectOpen) return;
  const t = setInterval(() => setConnectTick((x) => x + 1), 4000);
  return () => clearInterval(t);
}, [connectOpen]);

  const resetCount = async (id) => {
    try {
      await update(ref(db, `servers/${id}`), { date: dayKey(), count: 0, updatedAt: serverTimestamp() });
      showToast("מונה אופס", id);
    } catch (e) {
      showToast("שגיאה", friendlyWriteError(e), "error");
    }
  };

const deleteServer = async (id) => {
  try {
    // מסמנים למחיקה כדי שייראה ב-UI
    await update(ref(db, `servers/${id}`), {
      enabled: false,
      status: "deleting",
      state: "logout_and_cleanup",
      updatedAt: serverTimestamp(),
    });

    // ✅ שולחים פקודה ל-agent לבצע logout+סגירה+ניקוי+מחיקה
    await set(ref(db, `serverCommands/${id}`), {
      action: "delete",
      logout: true,
      purgeSession: true,
      killBrowser: true,
      by: "ui",
      requestedAt: Date.now(),
    });

    showToast("נשלחה פקודת מחיקה", id);
  } catch (e) {
    showToast("שגיאה", friendlyWriteError(e), "error");
  }
};

const reviveServers = async () => {
  try {
    const all = Object.keys(serversMap || {}).map((id) => ({ id, ...(serversMap[id] || {}) }));
    const targets = all.filter((s) => normalizeBool(s.enabled, true) === true).map((s) => s.id);

    await Promise.all(
      targets.map((id) =>
        set(ref(db, `serverCommands/${id}`), {
          action: "ensure_running",
          by: "ui",
          requestedAt: Date.now(),
        })
      )
    );

    showToast("חידוש נשלח", `${targets.length} שרתים פעילים`);
  } catch (e) {
    showToast("שגיאה", friendlyWriteError(e), "error");
  }
};

  const setSendDelay = async (id, ms) => {
    try {
      await update(ref(db, `servers/${id}`), { sendDelayMs: ms, updatedAt: serverTimestamp() });
      showToast("עודכן זמן השילוח", `${id} • ${formatDelay(ms)}`);
    } catch (e) {
      showToast("שגיאה", friendlyWriteError(e), "error");
    }
  };

const pickNextServerId = () => {
  const existing = new Set(Object.keys(serversMap || {}).map((k) => String(k).toLowerCase()));
  for (let i = 1; i <= 50; i++) {
    const id = `server${i}`;
    if (!existing.has(id)) return id;
  }
  return `server${Date.now()}`;
};

const createServer = async () => {
  const wanted = addName.trim().replace(/\s+/g, "_").toLowerCase();
  const id = wanted || pickNextServerId();

  try {
    const serverPath = ref(db, `servers/${id}`);

    const tx = await runTransaction(serverPath, (cur) => {
      if (cur) return; // ❌ אם קיים – מבטל יצירה
      return {
        enabled: true,
        dailyLimit: 50,
        date: dayKey(new Date()),
        count: 0,
        status: "booting",
        state: "waiting_qr",
        sendDelayMs: 3000,
        createdAt: nowISO(),
        updatedAt: Date.now(),
        lastSeen: nowISO(),
      };
    });

    if (!tx.committed) {
      showToast("שם שרת כבר קיים", `בחר שם אחר: ${id}`, "error");
      return;
    }

    await set(ref(db, `serverCommands/${id}`), {
      action: "start",
      by: "ui",
      requestedAt: Date.now(),
    });

    setAddOpen(false);
    setAddName("");
    setConnectServerId(id);
    setConnectOpen(true);
    showToast("שרת נוצר", `נשלחה פקודת start ל-${id}`);
  } catch (e) {
    showToast("שגיאה", friendlyWriteError(e), "error");
  }
};


  // ================== RENDER ITEMS ==================
  const renderServerCard = ({ item }) => {
    const srv = item;
    const enabled = normalizeBool(srv.enabled, true);
    const meta = getStatusMeta(theme, srv.status, srv.state);
    const active = isActiveServer(srv) && enabled;

    const today = dayKey();
    const sentToday = String(srv.date || "") === today ? safeNum(srv.count, 0) : 0;

    const startedAt =
      tryParseDate(srv?.processLock?.startedAt) ||
      tryParseDate(srv?.readyAt) ||
      tryParseDate(srv?.createdAt);

    const uptime = startedAt ? formatDuration(Date.now() - startedAt.getTime()) : "—";
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

    const lastSentAt = srv?.lastSentAt || null;
    const sendDelayMs = safeNum(srv?.sendDelayMs, 0);

    return (
      <Pressable
        onPress={() => {
          setSelectedServerId(srv.id);
          setLogsOpen(true);
        }}
        style={[
          styles.card,
          {
            width: cardSize.w,
            height: cardSize.h,
            backgroundColor: theme.cardBg,
            borderColor: theme.cardBorder,
            alignSelf: numColumns === 1 ? "center" : "auto",
          },
        ]}
      >
        {active && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: meta.color, opacity: 0.06, borderRadius: 18 },
            ]}
          />
        )}

        {active && <Animated.View style={[styles.glowBorder, { borderColor: meta.color, opacity: pulseOpacity }]} />}

        <View style={styles.cardHeader}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <View style={[styles.iconBox, { backgroundColor: theme.inputBg }]}>
              <MaterialCommunityIcons name="server" size={20} color={active ? meta.color : theme.textSecondary} />
            </View>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.textPrimary }]}>
              {srv.id}
            </Text>
          </View>
          <StatusBadge theme={theme} meta={meta} />
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Uptime</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{uptime}</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Sent (Today)</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{sentToday}</Text>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.cardBorder }]}>
          <View style={{ gap: 4 }}>
            <Text style={[styles.lastSeen, { color: theme.textSecondary }]}>
              <Ionicons name="time-outline" size={12} />{" "}
              {srv.lastSeen ? new Date(srv.lastSeen).toLocaleTimeString() : "—"}
            </Text>

            <Text style={[styles.lastSeen, { color: theme.textSecondary }]}>
              <Ionicons name="send-outline" size={12} />{" "}
              {lastSentAt ? formatWhen(lastSentAt) : "—"}{" "}
              <Text style={{ color: theme.textSecondary }}> • Delay: {formatDelay(sendDelayMs)}</Text>
            </Text>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity onPress={() => resetCount(srv.id)} style={styles.iconBtn}>
              <Ionicons name="refresh" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleEnabled(srv.id, srv.enabled)} style={styles.iconBtn}>
              <Ionicons name={enabled ? "pause" : "play"} size={16} color={enabled ? theme.warning : theme.success} />
            </TouchableOpacity>
          </View>
        </View>

        {!enabled && (
          <View style={styles.disabledOverlay}>
            <Ionicons name="lock-closed" size={24} color={theme.warning} />
          </View>
        )}
      </Pressable>
    );
  };

  const renderAddCard = () => (
    <Pressable
      onPress={() => setAddOpen(true)}
      style={[
        styles.cardAdd,
        {
          width: cardSize.w,
          height: cardSize.h,
          borderColor: theme.cardBorder,
          alignSelf: numColumns === 1 ? "center" : "auto",
        },
      ]}
    >
      <LinearGradient colors={[theme.cardBg, "transparent"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.addCircle, { borderColor: theme.accent }]}>
        <Ionicons name="add" size={32} color={theme.accent} />
      </View>
      <Text style={[styles.addText, { color: theme.textPrimary }]}>הוסף שרת חדש</Text>

    </Pressable>
  );

  const dataWithAdd = useMemo(() => [...serversArray, { __add: true, id: "__add__" }], [serversArray]);

  // connect modal
const statusStr = String(connectServerData?.status || "").toLowerCase();
const stateStr = String(connectServerData?.state || "").toLowerCase();

const connectQr =
  connectServerData?.qr ||
  connectServerData?.qrValue ||
  connectServerData?.qrCode ||
  null;

const isLoading =
  stateStr.startsWith("loading_") || stateStr.includes("loading") || stateStr.includes("state_");

const isAuth =
  statusStr === "authenticated" ||
  stateStr.includes("authenticated") ||
  stateStr.includes("auth");

const connectReady =
  statusStr === "online" ||
  stateStr.includes("ready");

const shouldShowQr = !connectReady && !!connectQr;
const shouldShowSpinner = !connectReady && !connectQr;

// שלב UI (לפי סדר עדיפויות)
const connectPhase = connectReady
  ? "ready"
  : shouldShowQr
  ? "scan_qr"
  : isAuth
  ? "auth"
  : isLoading
  ? "loading"
  : "waiting_qr";

// סטטוסים מתחלפים לפי שלב
const phaseMessages = useMemo(() => {
  if (connectPhase === "waiting_qr") {
    return ["מפעיל את השרת…", "מתחבר ל-WhatsApp Web…", "ממתין ל-QR מהשרת…"];
  }
  if (connectPhase === "scan_qr") {
    return ["סרוק את ה-QR בוואטסאפ", "WhatsApp → מכשירים מקושרים → קישור מכשיר", "אחרי הסריקה נחבר אותך אוטומטית…"];
  }
  if (connectPhase === "loading") {
    return ["קיבלתי סריקה ✅", "טוען WhatsApp Web…", "עוד רגע מסיים התחברות…"];
  }
  if (connectPhase === "auth") {
    return ["אומת בהצלחה ✅", "מסיים סנכרון…", "מכין את הבוט לשליחה…"];
  }
  return ["מחובר בהצלחה ✅", "הבוט מוכן לשליחה", "אפשר לסגור את החלון"];
}, [connectPhase]);

const phaseLine = phaseMessages[connectTick % phaseMessages.length];

// כותרת/צבע לפי שלב
const phaseMeta = useMemo(() => {
  if (connectPhase === "ready") return { color: theme.success, title: "מחובר!", sub: "השרת מחובר ומוכן." };
  if (connectPhase === "scan_qr") return { color: theme.warning, title: "סריקת QR", sub: phaseLine };
  if (connectPhase === "loading") return { color: theme.accent, title: "מתחבר…", sub: phaseLine };
  if (connectPhase === "auth") return { color: theme.accent, title: "מאמת…", sub: phaseLine };
  return { color: theme.textSecondary, title: "ממתין…", sub: phaseLine };
}, [connectPhase, phaseLine, theme]);



  // ================== UI ==================
  return (
    <LinearGradient colors={theme.bgGradient} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.customHeader, { borderBottomColor: theme.cardBorder, backgroundColor: theme.headerGlass }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.06)" }]}
          >
            <Ionicons name="arrow-forward" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Servers</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.headerActionBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" }]}
          >
            <Ionicons name="reload" size={20} color={theme.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
        onPress={reviveServers}
        style={[styles.headerActionBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" }]}
        >
        <Ionicons name="sparkles" size={20} color={theme.textPrimary} />
        </TouchableOpacity>

        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* KPI */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiRow}>
            <StatCard theme={theme} label="Online" value={kpis.online} icon="wifi" color={theme.success} />
            <StatCard theme={theme} label="Disabled" value={kpis.disabled} icon="pause-circle" color={theme.warning} />
            <StatCard theme={theme} label="Today" value={kpis.sentToday} icon="paper-plane" color={theme.accent} />
          </View>
        </View>

        {/* Search & Filter */}
        <View style={styles.toolbar}>
          <View style={[styles.searchBox, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder }]}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="חיפוש שרת..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.textPrimary }]}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {["all", "online", "disabled", "offline"].map((k) => (
              <TouchableOpacity
                key={k}
                onPress={() => setFilter(k)}
                style={[
                  styles.filterChip,
                  filter === k
                    ? { backgroundColor: theme.accent }
                    : { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" },
                ]}
              >
                <Text style={[styles.filterText, filter === k ? { color: "#fff" } : { color: theme.textSecondary }]}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Grid */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : (
          <FlatList
            data={dataWithAdd}
            key={numColumns}
            numColumns={numColumns}
            scrollEnabled={false}
            columnWrapperStyle={numColumns > 1 ? { gap, paddingHorizontal: horizontalPad } : undefined}
            contentContainerStyle={{
              paddingHorizontal: numColumns === 1 ? 0 : undefined,
              paddingBottom: 10,
              gap,
            }}
            renderItem={({ item }) => (item.__add ? renderAddCard() : renderServerCard({ item }))}
            ListHeaderComponent={numColumns === 1 ? <View style={{ height: 0 }} /> : null}
          />
        )}
      </ScrollView>

      {/* ====== DETAILS MODAL ====== */}
      <Modal
        visible={logsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setLogsOpen(false);
          setSelectedServerId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.modalBg, borderColor: theme.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{selectedServerId}</Text>
              <TouchableOpacity
                onPress={() => {
                  setLogsOpen(false);
                  setSelectedServerId(null);
                }}
              >
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedServer ? (
              <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
                <View style={styles.modalBody}>
                  <View style={[styles.codeBlock, { backgroundColor: isDark ? "rgba(0,0,0,0.30)" : "rgba(15,23,42,0.06)" }]}>
                    <Text style={[styles.codeText, { color: theme.textPrimary }]}>
                      Status: {selectedServer.status || "—"}{"\n"}
                      State: {selectedServer.state || "—"}{"\n"}
                      Enabled: {String(normalizeBool(selectedServer.enabled, true))}{"\n"}
                      Delay: {formatDelay(selectedServer.sendDelayMs)}{"\n"}
                      Last Error: {selectedServer.reason || selectedServer.lastError || "None"}
                    </Text>
                  </View>

                  <View style={styles.detailGrid}>
                    {[
                      ["Count", String(selectedServer.count ?? "—")],
                      ["Date", String(selectedServer.date ?? "—")],
                      ["Last Seen", selectedServer.lastSeen ? new Date(selectedServer.lastSeen).toLocaleString() : "—"],
                      ["Last Sent", selectedServer.lastSentAt ? formatWhen(selectedServer.lastSentAt) : "—"],
                    ].map(([k, v], i) => (
                      <View key={i} style={[styles.detailItem, { borderColor: theme.cardBorder, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)" }]}>
                        <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{k}</Text>
                        <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{v}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Delay Picker */}
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 18 }]}>
                    זמן המתנה בין הודעה להודעה
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 10 }}>
                    {SEND_DELAY_OPTIONS.map((opt) => {
                      const selected = safeNum(selectedServer.sendDelayMs, 0) === opt.ms;
                      return (
                        <TouchableOpacity
                          key={String(opt.ms)}
                          onPress={() => setSendDelay(selectedServer.id, opt.ms)}
                          style={[
                            styles.delayChip,
                            selected
                              ? { backgroundColor: theme.accent }
                              : { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" },
                          ]}
                        >
                          <Text style={[styles.delayChipText, { color: selected ? "#fff" : theme.textSecondary }]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

<View style={styles.modalActions}>
  {/* Row 1: השהה/המשך + אפס */}
  <View style={{ flexDirection: "row-reverse", gap: 10 }}>
    <TouchableOpacity
      style={[
        styles.actionBtn,
        {
          flex: 1,
          backgroundColor: normalizeBool(selectedServer.enabled, true)
            ? theme.warning + "18"
            : theme.success + "18",
          borderColor: normalizeBool(selectedServer.enabled, true)
            ? theme.warning + "35"
            : theme.success + "35",
          borderWidth: 1,
        },
      ]}
      onPress={() => toggleEnabled(selectedServer.id, selectedServer.enabled)}
    >
      <Text
        style={{
          color: normalizeBool(selectedServer.enabled, true) ? theme.warning : theme.success,
          fontWeight: "900",
        }}
      >
        {normalizeBool(selectedServer.enabled, true) ? "השהה שרת" : "המשך שרת"}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[
        styles.actionBtn,
        {
          flex: 1,
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
        },
      ]}
      onPress={() => resetCount(selectedServer.id)}
    >
      <Text style={{ color: theme.textPrimary, fontWeight: "900" }}>אפס מונה</Text>
    </TouchableOpacity>
  </View>

  {/* Row 2: מחיקה */}
  <TouchableOpacity
    style={[
      styles.actionBtn,
      {
        backgroundColor: theme.danger + "18",
        borderColor: theme.danger + "35",
        borderWidth: 1,
      },
    ]}
    onPress={() => deleteServer(selectedServer.id)}
  >
    <Text style={{ color: theme.danger, fontWeight: "900" }}>מחק שרת</Text>
  </TouchableOpacity>
</View>

                </View>
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 22 }}>
                <Text style={{ color: theme.textSecondary, textAlign: "center" }}>אין נתונים לשרת הזה.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ====== ADD MODAL ====== */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.modalBg, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary, textAlign: "center" }]}>שרת חדש</Text>

            <TextInput
              value={addName}
              onChangeText={setAddName}
              placeholder="שם השרת (לדוגמא: server6)"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.modalInput,
                {
                  backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(15,23,42,0.06)",
                  color: theme.textPrimary,
                  borderColor: theme.cardBorder,
                },
              ]}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={[styles.modalMainBtn, { backgroundColor: theme.accent }]} onPress={createServer}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>צור שרת</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalMainBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)" }]} onPress={() => setAddOpen(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: "800" }}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====== QR MODAL ====== */}
   {/* ====== QR MODAL ====== */}
<Modal visible={connectOpen} transparent animationType="slide">
  <View style={styles.modalOverlay}>
    <View
      style={[
        styles.modalCard,
        {
          backgroundColor: theme.modalBg,
          borderColor: theme.cardBorder,
          alignItems: "center",
        },
      ]}
    >
      <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>סריקת QR</Text>

      <Text style={{ color: theme.textSecondary, marginBottom: 10, textAlign: "center" }}>
        השרת: <Text style={{ color: theme.textPrimary, fontWeight: "900" }}>{connectServerId}</Text>
      </Text>

      {/* סטטוס מרכזי אחד (כותרת + שורה מתחלפת) */}
      <View
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: phaseMeta.color + "40",
          backgroundColor: phaseMeta.color + "12",
          marginBottom: 14,
        }}
      >
        <Text style={{ color: phaseMeta.color, fontWeight: "900", textAlign: "center" }}>
          {phaseMeta.title}
        </Text>
        <Text style={{ marginTop: 6, color: theme.textSecondary, fontWeight: "800", textAlign: "center" }}>
          {phaseMeta.sub}
        </Text>

        {/* מידע טכני קטן (יעזור לך להבין מה קורה בזמן אמת) */}
        <Text style={{ marginTop: 8, color: theme.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "center" }}>
          status: {statusStr || "—"} • state: {stateStr || "—"}
        </Text>
      </View>

      {/* Body: QR / Spinner / Success */}
      {connectReady ? (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 12 }}>
          <View
            style={{
              width: 86,
              height: 86,
              borderRadius: 43,
              backgroundColor: theme.success + "20",
              borderWidth: 2,
              borderColor: theme.success + "55",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark" size={44} color={theme.success} />
          </View>

          <Text style={{ marginTop: 12, color: theme.success, fontWeight: "900" }}>מחובר בהצלחה!</Text>
          <Text style={{ marginTop: 6, color: theme.textSecondary, fontWeight: "700", textAlign: "center" }}>
            אין צורך ב-QR נוסף — השרת כבר מחובר.
          </Text>
        </View>
      ) : shouldShowQr ? (
        <View style={{ padding: 18, backgroundColor: "#fff", borderRadius: 16 }}>
          <QRCode value={String(connectQr)} size={210} />
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 10 }}>
          <ActivityIndicator size="large" color={theme.accent} style={{ margin: 18 }} />
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.modalMainBtn,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
            marginTop: 16,
            width: "100%",
          },
        ]}
        onPress={() => {
          setConnectOpen(false);
          setConnectServerId(null);
          setConnectServerData(null);
        }}
      >
        <Text style={{ color: theme.textPrimary, fontWeight: "900" }}>סגור</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>


      <Toast toast={toast} />
    </LinearGradient>
  );
}

// ================== STYLES ==================
const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { padding: 40, alignItems: "center" },

  customHeader: {
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 20, fontWeight: "900" },
  headerRight: { flexDirection: "row-reverse", gap: 10 },
  headerActionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  kpiContainer: { paddingHorizontal: 20, marginTop: 18 },
  kpiRow: { flexDirection: "row-reverse", gap: 10 },

  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  statIconWrap: { padding: 8, borderRadius: 10 },
  statValue: { fontSize: 18, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700" },

  toolbar: { paddingHorizontal: 20, marginVertical: 18, gap: 14 },
  searchBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
    borderWidth: 1,
  },
  searchInput: { flex: 1, textAlign: "right", paddingHorizontal: 8, fontWeight: "700" },
  filterChip: { paddingHorizontal: 16, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filterText: { fontSize: 12, fontWeight: "900" },

  // card
  card: { borderRadius: 20, borderWidth: 1, overflow: "hidden", padding: 16 },
  glowBorder: { position: "absolute", inset: 0, borderWidth: 2, borderRadius: 20 },

  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "900", marginLeft: 10, maxWidth: 160 },

  badge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: "900" },

  metricsContainer: {
    flexDirection: "row-reverse",
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(148,163,184,0.12)",
  },
  metricItem: { flex: 1, alignItems: "center" },
  metricLabel: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  metricValue: { fontSize: 15, fontWeight: "900" },
  metricDivider: { width: 1, backgroundColor: "rgba(148,163,184,0.18)" },

  cardFooter: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 12, borderTopWidth: 1 },
  lastSeen: { fontSize: 11, fontWeight: "700" },
  cardActions: { flexDirection: "row-reverse", gap: 10 },
  iconBtn: { padding: 6 },

  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  // add card
  cardAdd: {
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  addCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  addText: { fontSize: 14, fontWeight: "900" },

  // modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 520, borderRadius: 24, borderWidth: 1, padding: 22 },
  modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: "900" },

  modalBody: { paddingBottom: 8 },

  codeBlock: { padding: 12, borderRadius: 12, marginBottom: 16 },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },

  detailGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  detailItem: { width: "48%", borderWidth: 1, padding: 10, borderRadius: 12 },
  detailLabel: { fontSize: 11, marginBottom: 2, fontWeight: "800" },
  detailValue: { fontSize: 14, fontWeight: "900" },

  sectionTitle: { fontSize: 14, fontWeight: "900" },
  delayChip: { paddingHorizontal: 14, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  delayChipText: { fontSize: 12, fontWeight: "900" },

  modalActions: { marginTop: 16, gap: 10 },
  actionBtn: { height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  modalInput: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, textAlign: "right", marginVertical: 18, fontWeight: "800" },
  modalActionsRow: { gap: 10 },
  modalMainBtn: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  // toast
  toastWrap: { position: "absolute", bottom: 40, left: 20, right: 20, alignItems: "center" },
  toast: { flexDirection: "row-reverse", alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1, gap: 12, width: "100%", maxWidth: 420 },
  toastTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  toastMsg: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
});