import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Modal,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  useColorScheme,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { Stack, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { ref, push, set, onValue, off, remove, update } from "firebase/database";
import { auth, db } from "../src/firebase";
import { Calendar } from "react-native-calendars";

import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import * as ImagePicker from "expo-image-picker";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";

// ---------------- Helpers ----------------
function sanitizePhone(s) {
  return String(s || "").replace(/[^\d]/g, "");
}
async function uriToBlob(uri) {
  const res = await fetch(uri);
  return await res.blob();
}

function normalizeILPhone(raw) {
  const p = sanitizePhone(raw);
  if (!p) return "";
  if (p.startsWith("972")) return p;
  if (p.startsWith("0") && p.length >= 9) return "972" + p.slice(1);
  if (p.startsWith("5") && (p.length === 9 || p.length === 10)) return "972" + p;
  return p;
}

function dayKeyFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

function prettyStatus(st) {
  const s = String(st || "").toLowerCase();
  if (s === "sent") return { t: "נשלח", c: "#10b981", i: "check" };
  if (s === "error" || s === "failed") return { t: "שגיאה", c: "#ef4444", i: "alert-circle" };
  if (s === "sending" || s === "processing") return { t: "בשליחה", c: "#f59e0b", i: "dots-horizontal" };
  return { t: "ממתין", c: "#94a3b8", i: "clock-outline" };
}

function pad2(n) {
  const x = Number(n || 0);
  return x < 10 ? `0${x}` : `${x}`;
}

function isoFromDateTimeStrings(dateStr, timeStr) {
  // date: YYYY-MM-DD , time: HH:mm
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{2}:\d{2}$/.test(t)) return null;

  const [Y, M, D] = d.split("-").map((x) => Number(x));
  const [h, m] = t.split(":").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D, h, m, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function dateStrFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const Y = d.getFullYear();
  const M = pad2(d.getMonth() + 1);
  const D = pad2(d.getDate());
  return `${Y}-${M}-${D}`;
}

function timeStrFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtShortDT(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "—";
  // DD/MM HH:mm
  const DD = pad2(d.getDate());
  const MM = pad2(d.getMonth() + 1);
  const HH = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${DD}/${MM} ${HH}:${mm}`;
}
function msParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return { days, hours, mins, secs };
}

function fmtCountdown(ms) {
  const { days, hours, mins, secs } = msParts(ms);
  const d = days > 0 ? `${days}d ` : "";
  return `${d}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function combineDateAndTimeToISO(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  const iso = isoFromDateTimeStrings(dateStr, timeStr);
  return iso;
}

function isoToMs(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function pickMsgISO(m) {
  return m?.createdAt || m?.sentAt || m?.updatedAt || m?.scheduleMessage || "";
}

function timeHHmm(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function dateDDMMYYYY(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("he-IL");
}

function hourBucket(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { key: "unknown", h: -1, label: "לא ידוע" };
  const h = d.getHours();
  const label = `${String(h).padStart(2, "0")}:00`;
  return { key: label, h, label };
}

function shortBatchId(bid) {
  if (!bid) return "";
  const s = String(bid);
  return s.length > 10 ? s.slice(-6) : s;
}

function makeProject(n) {
  const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    name: `קמפיין ${n}`,
    tab: "campaign",

    // ✅ הכי חשוב: כל פרויקט מקבל eventId ייחודי משלו => הפרדה מוחלטת של people + history
    eventId: id,

    messageText: "שלום! זו הודעה לדוגמה...\n",
    imageUrl: "",

    // שליחה: now או schedule
    sendMode: "schedule", // "now" | "schedule"
    scheduleISO: new Date().toISOString(),

    selectedTplId: null,
    updatedAt: Date.now(),
  };
}

// base64 -> blob (web download)
function b64ToBlob(b64Data, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

async function safeHapticLight() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

async function safeHapticSuccess() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

// ---------------- UI Components ----------------
const TabBtn = ({ active, text, onPress, icon, s, c }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.tabBtn, active && { backgroundColor: c.tabOnBg }]}>
    {active && (
      <LinearGradient
        colors={c.tabOnGrad}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    )}
    <Ionicons name={icon} size={18} color={active ? c.accent : c.muted} />
    <Text style={[s.tabTxt, { color: active ? c.text : c.muted }]}>{text}</Text>
    {active && <View style={[s.activeTabIndicator, { backgroundColor: c.accent }]} />}
  </TouchableOpacity>
);

const StatPill = ({ label, value, color, icon, s, c }) => (
  <View style={[s.statPill, { borderLeftColor: color, backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
    <View style={s.statContent}>
      <Text style={[s.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color }]}>{label}</Text>
    </View>
    <View style={[s.statIconObj, { backgroundColor: color + "15" }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
  </View>
);

const SegBtn = ({ active, icon, text, onPress, c, s }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.9}
    style={[
      s.segBtn,
      {
        backgroundColor: active ? c.accent : c.chipBg,
        borderColor: active ? c.accent : c.chipBorder,
      },
    ]}
  >
    <Ionicons name={icon} size={16} color={active ? "#fff" : c.text} />
    <Text style={[s.segTxt, { color: active ? "#fff" : c.text }]}>{text}</Text>
  </TouchableOpacity>
);

const QuickChip = ({ text, onPress, c, s }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[s.quickChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
    <Text style={[s.quickChipTxt, { color: c.text }]}>{text}</Text>
  </TouchableOpacity>
);

// ---------------- Screen ----------------
export default function Send() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 980;

  const systemScheme = useColorScheme();
  const uid = auth.currentUser?.uid || null;
const navigation = useNavigation();

const goToServers = () => {
  navigation.navigate("ServersDashboardScreen");
};

  // ---------- THEME (Auto/Light/Dark) ----------
  const [uiMode, setUiMode] = useState("auto"); // auto | dark | light

  const resolvedIsDark = useMemo(() => {
    if (uiMode === "dark") return true;
    if (uiMode === "light") return false;
    return systemScheme === "dark";
  }, [uiMode, systemScheme]);

  const c = useMemo(() => {
    const isDark = resolvedIsDark;

    return {
      isDark,
      accent: isDark ? "#60a5fa" : "#2563eb",
      danger: "#ef4444",
      success: "#10b981",
      warn: "#f59e0b",

      bgGrad: isDark ? ["#020617", "#0f172a", "#172554"] : ["#f8fafc", "#eef2ff", "#e0e7ff"],
      bgSolid: isDark ? "#020617" : "#f8fafc",

      headerText: isDark ? "#f8fafc" : "#0f172a",
      text: isDark ? "#e2e8f0" : "#0f172a",
      subText: isDark ? "#94a3b8" : "#475569",
      muted: isDark ? "#64748b" : "#64748b",

      cardBg: isDark ? "rgba(30,41,59,0.55)" : "rgba(255,255,255,0.75)",
      cardBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.12)",

      fieldBg: isDark ? "#020617" : "#ffffff",
      fieldBorder: isDark ? "#1e293b" : "rgba(15,23,42,0.14)",
      fieldPlaceholder: isDark ? "#475569" : "#94a3b8",

      chipBg: isDark ? "#0f172a" : "rgba(255,255,255,0.9)",
      chipBorder: isDark ? "#1e293b" : "rgba(15,23,42,0.12)",

      tabOnBg: isDark ? "rgba(30,41,59,0.5)" : "rgba(37,99,235,0.12)",
      tabOnGrad: isDark ? ["rgba(59,130,246,0.20)", "transparent"] : ["rgba(37,99,235,0.10)", "transparent"],

      modalOverlay: "rgba(0,0,0,0.75)",
      modalBg: isDark ? "#1e293b" : "#ffffff",
      modalBorder: isDark ? "#334155" : "rgba(15,23,42,0.12)",
    };
  }, [resolvedIsDark]);

  const s = useMemo(() => makeStyles(), []);

  // save theme in Firebase: users/{uid}/ui/theme
  const themeRef = useMemo(() => (uid ? ref(db, `users/${uid}/ui/theme`) : null), [uid]);
const [batchModal, setBatchModal] = useState(false);
const [activeBatch, setActiveBatch] = useState(null);

  useEffect(() => {
    if (!uid || !themeRef) return;
    const h = onValue(themeRef, (snap) => {
      const v = snap.val();
      if (v?.mode) setUiMode(String(v.mode));
    });
    return () => off(themeRef, "value", h);
  }, [uid, themeRef]);

  const persistTheme = useCallback(
    async (nextMode) => {
      if (!uid) return;
      try {
        await set(ref(db, `users/${uid}/ui/theme`), {
          mode: nextMode || "auto",
          platform: Platform.OS,
          systemScheme: systemScheme || "unknown",
          resolvedIsDark: nextMode === "dark" ? true : nextMode === "light" ? false : systemScheme === "dark",
          ts: Date.now(),
        });
      } catch (e) {
        console.log("theme save error:", e?.code || e?.message);
      }
    },
    [uid, systemScheme]
  );

  const cycleTheme = async () => {
    const next = uiMode === "auto" ? "dark" : uiMode === "dark" ? "light" : "auto";
    setUiMode(next);
    await persistTheme(next);
    await safeHapticLight();
  };


  // ---------- Animation ----------
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, []);

  // ---------- Projects ----------
  const [projects, setProjects] = useState(() => [makeProject(1)]);
  const [activePid, setActivePid] = useState(() => projects[0]?.id);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activePid) || projects[0],
    [projects, activePid]
  );

  const projectsRef = useMemo(() => (uid ? ref(db, `users/${uid}/send/projects`) : null), [uid]);

  // load projects from firebase + ✅ migrate old "default" eventId
  useEffect(() => {
    if (!uid || !projectsRef) return;

    const h = onValue(
      projectsRef,
      async (snap) => {
        const v = snap.val() || {};
        let arr = Object.entries(v).map(([id, p]) => ({ id, ...p }));

        arr.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

        if (arr.length === 0) {
          const def = makeProject(1);
          setProjects([def]);
          setActivePid(def.id);
          set(ref(db, `users/${uid}/send/projects/${def.id}`), def).catch(() => {});
          return;
        }

        // ✅ מיגרציה שקטה: אם eventId חסר/“default” -> eventId = project.id
        const needFix = arr.filter((p) => !p.eventId || String(p.eventId).trim() === "" || String(p.eventId).toLowerCase() === "default");
        if (needFix.length) {
          needFix.forEach((p) => {
            update(ref(db, `users/${uid}/send/projects/${p.id}`), { eventId: p.id, updatedAt: Date.now() }).catch(() => {});
          });
          arr = arr.map((p) => {
            const bad = !p.eventId || String(p.eventId).trim() === "" || String(p.eventId).toLowerCase() === "default";
            return bad ? { ...p, eventId: p.id } : p;
          });
        }

        // ensure sendMode default
        arr = arr.map((p) => ({
          ...p,
          sendMode: p.sendMode === "now" || p.sendMode === "schedule" ? p.sendMode : "schedule",
          scheduleISO: p.scheduleISO || new Date().toISOString(),
        }));

        setProjects(arr);
        setActivePid((prev) => (arr.some((x) => x.id === prev) ? prev : arr[0].id));
      },
      (err) => console.log("projects read error:", err?.code || err?.message)
    );

    return () => off(projectsRef, "value", h);
  }, [uid, projectsRef]);

  const [nowTick, setNowTick] = useState(Date.now());

useEffect(() => {
  const t = setInterval(() => setNowTick(Date.now()), 1000);
  return () => clearInterval(t);
}, []);

const scheduleBtnSub = useMemo(() => {
  if (activeProject?.sendMode === "now") return "שלח עכשיו";
  const t = new Date(activeProject?.scheduleISO || "").getTime();
  if (!t) return "קבע זמן שליחה";
  const diff = t - nowTick;
  if (diff <= 0) return "הזמן הגיע לשליחה";
  const { days, hours, mins, secs } = msParts(diff);
  const d = days ? `${days} ימים • ` : "";
  return `נשלח בעוד ${d}${hours}ש ${mins}דק ${secs}שנ`;
}, [activeProject?.sendMode, activeProject?.scheduleISO, nowTick]);

  const patchProjectLocal = (patch) => {
    if (!activeProject?.id) return;
    setProjects((prev) => prev.map((p) => (p.id === activeProject.id ? { ...p, ...patch } : p)));
  };

  const patchProject = async (patch) => {
    if (!uid || !activeProject?.id) return;
    patchProjectLocal(patch);
    try {
      await update(ref(db, `users/${uid}/send/projects/${activeProject.id}`), {
        ...patch,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.log("project update error:", e?.code || e?.message);
    }
  };

  const addProject = async () => {
    const p = makeProject(projects.length + 1);
    setProjects((prev) => [p, ...prev]);
    setActivePid(p.id);
    await safeHapticLight();

    if (!uid) return;
    try {
      await set(ref(db, `users/${uid}/send/projects/${p.id}`), p);
    } catch (e) {
      console.log("addProject db error:", e?.code || e?.message);
    }
  };
const storage = getStorage(); // או: const storage = storageFromFirebaseFile;

const pickAndUploadImage = useCallback(async () => {
  try {
    if (!uid || !activeProject?.id) {
      Alert.alert("שגיאה", "אין משתמש/פרויקט פעיל");
      return;
    }

    // פתיחת גלריה
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setBusy(true);

    // העלאה ל-Storage
    const blob = await uriToBlob(asset.uri);
    const path = `users/${uid}/send/images/${activeProject.id}/${Date.now()}.jpg`;
    const r = sRef(storage, path);

    await uploadBytes(r, blob, { contentType: blob.type || "image/jpeg" });
    const url = await getDownloadURL(r);

    // ✅ שומר URL בפרויקט שלך (הכי חשוב לתזמון)
    await patchProject({ imageUrl: url });

    Alert.alert("הצלחה", "התמונה עלתה ונשמרה בפרויקט ✅");
  } catch (e) {
    console.log("pickAndUploadImage error:", e?.message);
    Alert.alert("שגיאה", e?.message || "נכשל להעלות תמונה");
  } finally {
    setBusy(false);
  }
}, [uid, activeProject?.id, patchProject]);


  const removeProject = async (pid) => {
    if (projects.length <= 1) return Alert.alert("שגיאה", "חייב להישאר פרויקט אחד לפחות");

    const nextList = projects.filter((p) => p.id !== pid);
    setProjects(nextList);
    if (activePid === pid) setActivePid(nextList[0]?.id);

    await safeHapticLight();

    if (!uid) return;
    try {
      await remove(ref(db, `users/${uid}/send/projects/${pid}`));
    } catch (e) {
      console.log("removeProject db error:", e?.code || e?.message);
    }
  };

  // rename project modal
  const [renameModal, setRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const openRename = () => {
    setRenameValue(activeProject?.name || "");
    setRenameModal(true);
  };

  const confirmRename = async () => {
    const name = String(renameValue || "").trim();
    if (!name) return;
    await patchProject({ name });
    setRenameModal(false);
  };

  // ---------- Data States ----------
  const [tplName, setTplName] = useState("");
  const [templates, setTemplates] = useState([]);
  const [people, setPeople] = useState([]);

  // ---------- Modals ----------
  const [manualModal, setManualModal] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualNumber, setManualNumber] = useState("");

  const [scheduleModal, setScheduleModal] = useState(false);
  const [serversModal, setServersModal] = useState(false);

  // schedule draft (pretty UI)
  const [draftMode, setDraftMode] = useState("schedule"); // now | schedule
  const [draftDate, setDraftDate] = useState(dateStrFromISO(new Date().toISOString()));
  const [draftTime, setDraftTime] = useState(timeStrFromISO(new Date().toISOString()));
const [draftTimeText, setDraftTimeText] = useState(timeStrFromISO(new Date().toISOString()));

  // ---------- History ----------
  const [msgs, setMsgs] = useState([]);
  const [histDay, setHistDay] = useState(dayKeyFromISO(new Date().toISOString()));
  const [previewModal, setPreviewModal] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  const [busy, setBusy] = useState(false);

  // ✅ Audience sorting (button)
  const [audSort, setAudSort] = useState("status"); // status | updated | name

  const cycleAudienceSort = async () => {
    const next = audSort === "status" ? "updated" : audSort === "updated" ? "name" : "status";
    setAudSort(next);
    await safeHapticLight();
  };

  const audSortLabel = useMemo(() => {
    if (audSort === "status") return "מיון: סטטוס";
    if (audSort === "updated") return "מיון: עודכן";
    return "מיון: שם";
  }, [audSort]);

  // ✅ Reset some UI state when switching PROJECT
  useEffect(() => {
    setPeople([]);
    setMsgs([]);
    setHistDay(dayKeyFromISO(new Date().toISOString()));
    setTplName("");
    setPreviewModal(false);
    setPreviewItem(null);
  }, [activePid]);

  // ---------- Firebase Refs ----------
  const templatesRef = useMemo(() => (uid ? ref(db, `users/${uid}/templates`) : null), [uid]);
const [deleteProjModal, setDeleteProjModal] = useState(false);
const [deletePid, setDeletePid] = useState(null);
const openDeleteProject = (pid) => {
  setDeletePid(pid);
  setDeleteProjModal(true);
};

const closeDeleteProject = () => {
  setDeleteProjModal(false);
  setDeletePid(null);
};

const confirmDeleteProject = async () => {
  const pid = deletePid;
  closeDeleteProject();
  if (!pid) return;
  await safeHapticLight();
  await removeProject(pid);
};

  const peopleRef = useMemo(() => {
    const eventId = activeProject?.eventId || activeProject?.id || "default";
    return uid ? ref(db, `users/${uid}/events/${eventId}/people`) : null;
  }, [uid, activeProject?.eventId, activeProject?.id]);

  const msgsRef = useMemo(() => {
    const eventId = activeProject?.eventId || activeProject?.id || "default";
    return uid ? ref(db, `whatsapp/${uid}/${eventId}`) : null;
  }, [uid, activeProject?.eventId, activeProject?.id]);

  // ---------- Listeners ----------
  useEffect(() => {
    if (!uid || !templatesRef) return;
    const h = onValue(
      templatesRef,
      (snap) => {
        const v = snap.val() || {};
        const arr = Object.entries(v).map(([id, t]) => ({ id, ...t }));
        arr.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
        setTemplates(arr);
      },
      (err) => console.log("templates read error:", err?.code || err?.message)
    );
    return () => off(templatesRef, "value", h);
  }, [uid, templatesRef]);

  useEffect(() => {
    setPeople([]);
    if (!uid || !peopleRef) return;

    const h = onValue(
      peopleRef,
      (snap) => {
        const v = snap.val() || {};
        const arr = Object.entries(v).map(([id, p]) => ({ id, ...p }));
        arr.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "he"));
        setPeople(arr);
      },
      (err) => Alert.alert("שגיאה", err.message)
    );

    return () => off(peopleRef, "value", h);
  }, [uid, peopleRef]);

  useEffect(() => {
    setMsgs([]);
    if (!uid || !msgsRef) return;

    const h = onValue(
      msgsRef,
      (snap) => {
        const v = snap.val() || {};
        const arr = Object.entries(v).map(([id, m]) => ({ id, ...m }));
        arr.sort((a, b) => String(pickMsgISO(b)).localeCompare(String(pickMsgISO(a))));
        setMsgs(arr);

        if (arr.length > 0) {
          const newest = pickMsgISO(arr[0]) || new Date().toISOString();
          setHistDay(dayKeyFromISO(newest));
        } else {
          setHistDay(dayKeyFromISO(new Date().toISOString()));
        }
      },
      (err) => console.log("msgs read error:", err?.code || err?.message)
    );

    return () => off(msgsRef, "value", h);
  }, [uid, msgsRef]);

  // ---------- Derived ----------
  const stats = useMemo(() => {
    let pending = 0,
      sent = 0,
      error = 0;
    msgs.forEach((m) => {
      const st = String(m?.status || "").toLowerCase();
      if (st === "sent") sent++;
      else if (st === "error" || st === "failed") error++;
      else pending++;
    });
    return { pending, sent, error };
  }, [msgs]);

  const days = useMemo(() => {
    const map = new Map();
    msgs.forEach((m) => {
      const d = dayKeyFromISO(pickMsgISO(m));
      map.set(d, (map.get(d) || 0) + 1);
    });
    const arr = Array.from(map.entries()).map(([d, count]) => ({ d, count }));
    arr.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    return arr;
  }, [msgs]);

  const msgsByDay = useMemo(() => {
    return msgs
      .filter((m) => dayKeyFromISO(pickMsgISO(m)) === histDay)
      .sort((a, b) => isoToMs(pickMsgISO(b)) - isoToMs(pickMsgISO(a)));
  }, [msgs, histDay]);

  const historyMarkedDates = useMemo(() => {
  // days = [{d,count}]
  const marks = {};
  days.forEach(({ d, count }) => {
    marks[d] = {
      marked: true,
      dotColor: c.accent,
      customStyles: {
        container: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.cardBorder,
          backgroundColor: c.isDark ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.7)",
        },
        text: { color: c.text, fontWeight: "900" },
      },
    };
  });

  // highlight selected
  marks[histDay] = {
    ...(marks[histDay] || {}),
    selected: true,
    selectedColor: c.accent,
    customStyles: {
      container: {
        borderRadius: 12,
        backgroundColor: c.accent,
      },
      text: { color: "#fff", fontWeight: "900" },
    },
    dotColor: "#fff",
    marked: !!marks[histDay]?.marked,
  };

  return marks;
}, [days, histDay, c]);

const batchesByDay = useMemo(() => {
  const list = msgs
    .filter((m) => dayKeyFromISO(pickMsgISO(m)) === histDay)
    .sort((a, b) => isoToMs(pickMsgISO(b)) - isoToMs(pickMsgISO(a)));

  const map = new Map();

  list.forEach((m) => {
    const rawBid = String(m?.batchId || "").trim();
    const bid = rawBid ? rawBid : `single_${m.id}`;
    if (!map.has(bid)) map.set(bid, []);
    map.get(bid).push(m);
  });

  const batches = Array.from(map.entries()).map(([bid, items]) => {
    // זמן נציג: הכי חדש באצווה
    const latestISO = items.reduce((acc, x) => {
      const a = isoToMs(acc);
      const b = isoToMs(pickMsgISO(x));
      return b > a ? pickMsgISO(x) : acc;
    }, pickMsgISO(items[0]));

    const message = String(items[0]?.message || "").trim();
    const scheduleISO = items[0]?.scheduleMessage || items[0]?.scheduleISO || items[0]?.createdAt || latestISO;

    let sent = 0,
      error = 0,
      pending = 0;
    items.forEach((x) => {
      const st = String(x?.status || "").toLowerCase();
      if (st === "sent") sent++;
      else if (st === "error" || st === "failed") error++;
      else pending++;
    });

    const total = items.length;
    const batchSize = Number(items[0]?.batchSize || 0) || total;

    return {
      bid,
      items,
      total,
      batchSize,
      message,
      latestISO,
      scheduleISO,
      stats: { sent, error, pending },
    };
  });

  // newest first
  batches.sort((a, b) => isoToMs(b.latestISO) - isoToMs(a.latestISO));
  return batches;
}, [msgs, histDay]);


  // ✅ Map: latest status per phone
  const latestByPhone = useMemo(() => {
    const map = new Map();
    msgs.forEach((m) => {
      const phone = String(m?.formattedContacts || "").trim();
      if (!phone) return;

      const iso = pickMsgISO(m);
      const ts = isoToMs(iso);
      const prev = map.get(phone);

      if (!prev || ts > prev.ts) {
        map.set(phone, {
          ts,
          status: m?.status || "pending",
          updatedISO: m?.updatedAt || m?.sentAt || m?.createdAt || m?.scheduleMessage || "",
          msg: m,
        });
      }
    });
    return map;
  }, [msgs]);

  const audienceRows = useMemo(() => {
    return people.map((p) => {
      const phone = normalizeILPhone(p.phone);
      const last = latestByPhone.get(phone);
      const st = prettyStatus(last?.status || "pending");
      const updated = last?.updatedISO || p?.updatedAt || p?.createdAt || "";
      return { ...p, _normPhone: phone, _st: st, _updated: updated };
    });
  }, [people, latestByPhone]);

  const sortedAudienceRows = useMemo(() => {
    const statusRank = (st) => {
      const s = String(st || "").toLowerCase();
      // actionable first
      if (s === "error" || s === "failed") return 0;
      if (s === "pending") return 1;
      if (s === "sending" || s === "processing") return 2;
      if (s === "sent") return 3;
      return 9;
    };

    const arr = [...audienceRows];

    arr.sort((a, b) => {
      if (audSort === "name") {
        return String(a.name || "").localeCompare(String(b.name || ""), "he");
      }

      if (audSort === "updated") {
        const ta = isoToMs(a._updated);
        const tb = isoToMs(b._updated);
        return tb - ta; // newest first
      }

      // status
      const ra = statusRank(a?._st?.t === "שגיאה" ? "error" : a?.msg?.status || a?._st?.t);
      const rb = statusRank(b?._st?.t === "שגיאה" ? "error" : b?.msg?.status || b?._st?.t);

      // fallback: use original status string from last msg if exists
      const sA = String(latestByPhone.get(a._normPhone)?.status || "pending");
      const sB = String(latestByPhone.get(b._normPhone)?.status || "pending");

      const rra = statusRank(sA);
      const rrb = statusRank(sB);
      if (rra !== rrb) return rra - rrb;

      // within same status -> newest updated first
      const ta = isoToMs(a._updated);
      const tb = isoToMs(b._updated);
      if (tb !== ta) return tb - ta;

      // then name
      return String(a.name || "").localeCompare(String(b.name || ""), "he");
    });

    return arr;
  }, [audienceRows, audSort, latestByPhone]);

  // ---------- Actions ----------
  const logout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const saveTemplate = async () => {
    const name = String(tplName || "").trim();
    const text = String(activeProject?.messageText || "").trim();
    if (!uid) return Alert.alert("שגיאה", "אין משתמש מחובר");
    if (!name || !text) return Alert.alert("שגיאה", "חסר שם או תוכן");

    setBusy(true);
    await safeHapticLight();

    try {
      const r = push(templatesRef);
      await set(r, {
        name,
        text: activeProject.messageText,
        imageUrl: String(activeProject.imageUrl || "").trim() || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setTplName("");
    } catch (e) {
      const code = e?.code || "";
      console.log("saveTemplate error:", code, e?.message);

      if (String(code).includes("PERMISSION_DENIED")) {
        Alert.alert("אין הרשאות (Permission Denied)", "בדוק Rules לנתיב users/");
      } else {
        Alert.alert("שגיאה", e?.message || "נכשל לשמור טמפלייט");
      }
    } finally {
      setBusy(false);
    }
  };

  const pickTemplate = async (item) => {
    await patchProject({
      messageText: item.text || "",
      imageUrl: item.imageUrl || "",
      selectedTplId: item.id,
    });
    await safeHapticLight();
  };

  const deleteTemplate = async (tplId) => {
    if (!uid) return;
    try {
      await remove(ref(db, `users/${uid}/templates/${tplId}`));
      await safeHapticLight();
    } catch (e) {
      console.log("deleteTemplate error:", e?.code || e?.message);
      Alert.alert("שגיאה", e?.message || "לא הצליח למחוק טמפלייט");
    }
  };

  const addManualPerson = async () => {
    if (!uid || !peopleRef) return Alert.alert("שגיאה", "אין משתמש מחובר");
    const name = String(manualName || "").trim();
    const phone = normalizeILPhone(manualNumber);

    if (!name || !phone) return Alert.alert("שגיאה", "חסר שם או טלפון");

    setBusy(true);
    try {
      await set(push(peopleRef), { name, phone, createdAt: new Date().toISOString(), source: "manual" });
      setManualModal(false);
      setManualName("");
      setManualNumber("");
      await safeHapticLight();
    } catch (e) {
      console.log("addManualPerson error:", e?.code || e?.message);
      Alert.alert("שגיאה", e?.message || "לא הצליח להוסיף נמען");
    } finally {
      setBusy(false);
    }
  };

  const removePerson = async (personId) => {
    if (!uid) return;
    const eventId = activeProject?.eventId || activeProject?.id || "default";
    try {
      await remove(ref(db, `users/${uid}/events/${eventId}/people/${personId}`));
      await safeHapticLight();
    } catch (e) {
      console.log("removePerson error:", e?.code || e?.message);
      Alert.alert("שגיאה", e?.message || "לא הצליח למחוק נמען");
    }
  };

  const openScheduleModal = () => {
    const mode = activeProject?.sendMode === "now" ? "now" : "schedule";
    const iso = activeProject?.scheduleISO || new Date().toISOString();
    setDraftMode(mode);
    setDraftDate(dateStrFromISO(iso));
    setDraftTime(timeStrFromISO(iso));
    setDraftTimeText(timeStrFromISO(iso));

    setScheduleModal(true);
  };

const applyScheduleDraft = async () => {
  if (draftMode === "now") {
    await patchProject({ sendMode: "now" });
    setScheduleModal(false);
    return;
  }

  const iso = combineDateAndTimeToISO(draftDate, draftTime);
  if (!iso) return Alert.alert("שגיאה", "תאריך/שעה לא תקינים");

  const ms = new Date(iso).getTime();
  if (!ms) return Alert.alert("שגיאה", "תאריך/שעה לא תקינים");
  if (ms < Date.now() - 5000) return Alert.alert("שגיאה", "בחרת זמן שכבר עבר");

  await patchProject({ sendMode: "schedule", scheduleISO: new Date(ms).toISOString(), scheduleMs: ms });
  setScheduleModal(false);
};


  const bumpMinutes = (mins) => {
    const base = new Date();
    base.setMinutes(base.getMinutes() + mins);
    setDraftMode("schedule");
    setDraftDate(dateStrFromISO(base.toISOString()));
    setDraftTime(timeStrFromISO(base.toISOString()));
  };

  const setTomorrowAt = (hh, mm) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hh, mm, 0, 0);
    setDraftMode("schedule");
    setDraftDate(dateStrFromISO(d.toISOString()));
    setDraftTime(timeStrFromISO(d.toISOString()));
  };

  const sendCampaign = async (overrideMode) => {
    if (!uid) return Alert.alert("שגיאה", "אין משתמש מחובר");
    if (!people.length) return Alert.alert("שגיאה", "הרשימה ריקה");
    if (!String(activeProject?.messageText || "").trim()) return Alert.alert("שגיאה", "אין הודעה");

    const recipients = people
      .map((p) => ({ name: String(p.name || "").trim(), phone: normalizeILPhone(p.phone) }))
      .filter((p) => p.name && p.phone);

    await safeHapticSuccess();

    const eventId = activeProject?.eventId || activeProject?.id || "default";
    const basePath = `whatsapp/${uid}/${eventId}`;


const finalMode = overrideMode || activeProject?.sendMode || "schedule";

let scheduleMs = Date.now();
if (finalMode === "schedule") {
  const ms = new Date(activeProject?.scheduleISO || "").getTime();
  scheduleMs = ms ? ms : Date.now();
}
const scheduleMessage = new Date(scheduleMs).toISOString();


    const batchId = `batch_${Date.now()}`;
    const batchSize = recipients.length;

    setBusy(true);
    try {
      await Promise.all(
        recipients.map(async (p) => {
          const mRef = push(ref(db, basePath));
          return set(mRef, {
            formattedContacts: p.phone,
            recipientName: p.name,
            message: activeProject.messageText,
            imageUrl: activeProject.imageUrl || null,

            scheduleMessage,
            scheduleMessageMs: scheduleMs,

            batchId,
            batchSize,

            sms: "no",
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attempts: 0,
          });
        })
      );

      Alert.alert("הצלחה", `נוצרו ${recipients.length} הודעות`);
      await patchProject({ tab: "history" });
    } catch (e) {
      console.log("sendCampaign error:", e?.code || e?.message);
      Alert.alert("שגיאה", e?.message || "נכשל ליצור הודעות");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Excel ----------
  const downloadExcelTemplate = async () => {
    const wb = XLSX.utils.book_new();
    const data = [
      ["name", "phone"],
      ["ישראל ישראלי", "0521234567"],
      ["דוגמה", "0500000000"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "people");

    const fileName = `people_template_${(activeProject?.eventId || activeProject?.id || "default").replace(/\s/g, "")}.xlsx`;
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    setBusy(true);
    try {
      if (Platform.OS === "web") {
        const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
        const blob = b64ToBlob(b64, mime);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
        // eslint-disable-next-line import/namespace
        const uri = FileSystem.cacheDirectory + fileName;
        // eslint-disable-next-line import/namespace
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });

        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) return Alert.alert("שגיאה", "Sharing לא זמין במכשיר הזה");

        await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: "Download template" });
      }
      await safeHapticLight();
    } catch (e) {
      console.log("downloadExcelTemplate error:", e?.message);
      Alert.alert("שגיאה", e?.message || "נכשל להוריד טמפלייט");
    } finally {
      setBusy(false);
    }
  };

  const importFromExcel = async () => {
    if (!uid || !peopleRef) return Alert.alert("שגיאה", "אין משתמש מחובר");

    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      const asset = res?.assets?.[0];
      if (!asset?.uri) {
        setBusy(false);
        return;
      }

      let workbook;
      if (Platform.OS === "web") {
        const resp = await fetch(asset.uri);
        const ab = await resp.arrayBuffer();
        workbook = XLSX.read(ab, { type: "array" });
      } else {
        // eslint-disable-next-line import/namespace
        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        workbook = XLSX.read(b64, { type: "base64" });
      }

      const sheetName = workbook.SheetNames?.[0];
      if (!sheetName) throw new Error("לא נמצא Sheet בקובץ");

      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const existingPhones = new Set(people.map((p) => normalizeILPhone(p.phone)));
      let added = 0;

      for (const r of rows) {
        const name = String(r.name || r.Name || r["שם"] || "").trim();
        const phoneRaw = r.phone || r.Phone || r["טלפון"] || "";
        const phone = normalizeILPhone(phoneRaw);

        if (!name || !phone) continue;
        if (existingPhones.has(phone)) continue;

        await set(push(peopleRef), {
          name,
          phone,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: "excel",
        });

        existingPhones.add(phone);
        added++;
      }

      Alert.alert("הצלחה", `יובאו ${added} נמענים`);
      await safeHapticLight();
      await patchProject({ tab: "people" });
    } catch (e) {
      console.log("importFromExcel error:", e?.message);
      Alert.alert("שגיאה", e?.message || "נכשל לייבא אקסל");
    } finally {
      setBusy(false);
    }
  };

  const tab = activeProject?.tab || "campaign";
  const eventIdShown = activeProject?.eventId || activeProject?.id || "default";

  // ---------- UI ----------
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={c.isDark ? "light-content" : "dark-content"} />

      <LinearGradient colors={c.bgGrad} style={s.container}>
        <Animated.View style={[s.container, { opacity: fadeAnim }]}>
          {/* HEADER */}
          <View style={s.header}>
            <View>
              <Text style={[s.appName, { color: c.headerText }]}>
                AUTO<Text style={{ color: c.accent }}>MATE</Text>
              </Text>
              <Text style={[s.appSub, { color: c.subText }]}>מערכת הפצה חכמה</Text>
            </View>

            <View style={s.headerRight}>
              {/* Theme */}
              <TouchableOpacity onPress={cycleTheme} style={[s.topIconBtn, { borderColor: c.cardBorder, backgroundColor: c.cardBg }]}>
                <Ionicons
                  name={uiMode === "auto" ? "contrast-outline" : uiMode === "dark" ? "moon-outline" : "sunny-outline"}
                  size={18}
                  color={c.text}
                />
              </TouchableOpacity>

              {/* Servers Management */}
<TouchableOpacity
  onPress={goToServers}
  style={[s.topIconBtn, { borderColor: c.cardBorder, backgroundColor: c.cardBg }]}
>
  <MaterialCommunityIcons name="server" size={18} color={c.text} />
</TouchableOpacity>


              {/* Logout */}
              <TouchableOpacity style={[s.logoutBtn, { borderColor: c.cardBorder }]} onPress={logout}>
                <Ionicons name="log-out-outline" size={20} color={c.danger} />
              </TouchableOpacity>
            </View>
          </View>

          {/* PROJECTS BAR */}
          <View style={s.projectsBar}>
            <FlatList
              data={projects}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
              keyExtractor={(i) => i.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isActive = item.id === activePid;
                return (
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setActivePid(item.id)}
                      style={[
                        s.projectTab,
                        {
                          backgroundColor: isActive ? c.tabOnBg : c.cardBg,
                          borderColor: isActive ? c.accent : c.cardBorder,
                        },
                      ]}
                    >
                      <Text style={[s.projectTabTxt, { color: isActive ? c.text : c.subText }]} numberOfLines={1}>
                        {item.name}
                      </Text>

                      {isActive && (
                        <TouchableOpacity onPress={openRename} style={s.smallIcon}>
                          <Ionicons name="create-outline" size={16} color={c.accent} />
                        </TouchableOpacity>
                      )}

                      {isActive && (
<TouchableOpacity onPress={() => openDeleteProject(item.id)} style={s.smallIcon}>
                          <Ionicons name="close-circle" size={16} color={c.accent} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />

            <TouchableOpacity style={[s.addProjBtn, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]} onPress={addProject}>
              <Ionicons name="add" size={20} color={c.text} />
            </TouchableOpacity>
          </View>

          {/* STATS */}
          <View style={s.statsGrid}>
            <StatPill label="ממתין" value={stats.pending} color={c.warn} icon="time-outline" s={s} c={c} />
            <StatPill label="נשלח" value={stats.sent} color={c.success} icon="checkmark-circle-outline" s={s} c={c} />
            <StatPill label="שגיאות" value={stats.error} color={c.danger} icon="alert-circle-outline" s={s} c={c} />
          </View>

          {/* NAV TABS */}
          <View style={[s.navTabs, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
            <TabBtn active={tab === "campaign"} text="קמפיין" icon="create-outline" onPress={() => patchProject({ tab: "campaign" })} s={s} c={c} />
            <TabBtn active={tab === "people"} text="נמענים" icon="people-outline" onPress={() => patchProject({ tab: "people" })} s={s} c={c} />
            <TabBtn active={tab === "history"} text="היסטוריה" icon="analytics-outline" onPress={() => patchProject({ tab: "history" })} s={s} c={c} />
          </View>

          {/* CONTENT */}
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={s.scrollBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* CAMPAIGN */}
              {tab === "campaign" && (
                <View style={[s.splitView, compact && { flexDirection: "column" }]}>
                  {/* Card 1: Editor */}
                  <View style={[s.cardBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <Ionicons name="chatbubbles-outline" size={18} color={c.subText} />
                      <Text style={[s.cardTitle, { color: c.text }]}>עריכת הודעה</Text>
                    </View>

                    <TextInput
                      value={activeProject?.messageText || ""}
                      onChangeText={(t) => patchProject({ messageText: t, selectedTplId: null })}
                      multiline
                      style={[s.textGroup, { backgroundColor: c.fieldBg, color: c.text, borderColor: c.fieldBorder }]}
                      placeholder="הקלד את ההודעה כאן..."
                      placeholderTextColor={c.fieldPlaceholder}
                    />

                    <View style={[s.inputGroup, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder }]}>
  <Ionicons name="image-outline" size={18} color={c.muted} style={{ marginLeft: 10 }} />

  <TouchableOpacity
    onPress={pickAndUploadImage}
    activeOpacity={0.9}
    style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10 }}
  >
    <Text style={{ color: activeProject?.imageUrl ? c.text : c.fieldPlaceholder, fontWeight: "900", textAlign: "right" }}>
      {activeProject?.imageUrl ? "✅ נבחרה תמונה (לחץ להחלפה)" : "בחר תמונה (במקום לינק)"}
    </Text>
  </TouchableOpacity>

  {!!activeProject?.imageUrl && (
    <TouchableOpacity
      onPress={() => patchProject({ imageUrl: "" })}
      style={{ paddingHorizontal: 12, paddingVertical: 10 }}
      activeOpacity={0.8}
    >
      <Ionicons name="close-circle" size={18} color={c.danger} />
    </TouchableOpacity>
  )}
</View>


                    <View style={[s.divider, { backgroundColor: c.cardBorder }]} />

                    <View style={s.cardHeader}>
                      <Ionicons name="copy-outline" size={18} color={c.subText} />
                      <Text style={[s.cardTitle, { color: c.text }]}>טמפלייטים</Text>
                    </View>

                    <View style={s.row}>
                      <TextInput
                        value={tplName}
                        onChangeText={setTplName}
                        style={[
                          s.inputClean,
                          {
                            flex: 1,
                            backgroundColor: c.fieldBg,
                            color: c.text,
                            borderWidth: 1,
                            borderColor: c.fieldBorder,
                            borderRadius: 12,
                          },
                        ]}
                        placeholder="שם חדש לשמירה..."
                        placeholderTextColor={c.fieldPlaceholder}
                      />
                      <TouchableOpacity onPress={saveTemplate} style={[s.iconBtn, { backgroundColor: c.isDark ? "#0f766e" : "#0ea5a4" }]}>
                        <Ionicons name="save-outline" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>

                    <FlatList
                      data={templates}
                      scrollEnabled={false}
                      keyExtractor={(i) => i.id}
                      style={{ marginTop: 12 }}
                      renderItem={({ item }) => (
                        <View
                          style={[
                            s.tplRow,
                            {
                              backgroundColor: c.isDark ? "rgba(15,23,42,0.40)" : "rgba(255,255,255,0.65)",
                              borderColor: item.id === activeProject?.selectedTplId ? c.accent : "transparent",
                            },
                          ]}
                        >
                          <TouchableOpacity style={{ flex: 1 }} onPress={() => pickTemplate(item)}>
                            <Text style={[s.tplName, { color: c.text }]}>{item.name}</Text>
                            <Text numberOfLines={1} style={[s.tplSub, { color: c.subText }]}>
                              {item.text}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity onPress={() => deleteTemplate(item.id)} style={{ padding: 6 }}>
                            <Ionicons name="trash-outline" size={16} color={c.danger} />
                          </TouchableOpacity>
                        </View>
                      )}
                    />
                  </View>

                  {/* Card 2: Launch */}
                  <View style={[s.cardBox, compact ? { width: "100%" } : { width: 360 }, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <Ionicons name="rocket-outline" size={18} color={c.subText} />
                      <Text style={[s.cardTitle, { color: c.text }]}>בקרת שיגור</Text>
                    </View>

                    {/* ✅ Audience list + sort button (above launch controls) */}
                    <View style={[s.audienceBox, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                      <View style={s.audienceHead}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                          <Text style={[s.audienceTitle, { color: c.text }]}>נמענים</Text>
                          <Text style={[s.audienceCount, { color: c.subText }]}>{sortedAudienceRows.length}</Text>
                        </View>

                        <TouchableOpacity
                          onPress={cycleAudienceSort}
                          activeOpacity={0.9}
                          style={[s.sortBtn, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder }]}
                        >
                          <Ionicons name="swap-vertical-outline" size={16} color={c.text} />
                          <Text style={[s.sortBtnTxt, { color: c.text }]}>{audSortLabel}</Text>
                        </TouchableOpacity>
                      </View>

                      {sortedAudienceRows.length === 0 ? (
                        <Text style={{ color: c.subText, fontWeight: "800", textAlign: "right" }}>אין נמענים עדיין</Text>
                      ) : (
                        <FlatList
                          data={sortedAudienceRows}
                          keyExtractor={(it) => it.id}
                          nestedScrollEnabled
                          style={{ maxHeight: 220, marginTop: 10 }}
                          contentContainerStyle={{ paddingBottom: 6 }}
                          renderItem={({ item }) => {
                            const last = latestByPhone.get(item._normPhone);
                            const rawStatus = String(last?.status || "pending");
                            const st = prettyStatus(rawStatus);

                            return (
                              <View style={[s.audienceRow, { borderBottomColor: c.cardBorder }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[s.audienceName, { color: c.text }]} numberOfLines={1}>
                                    {item.name}
                                  </Text>
                                  <Text style={[s.audiencePhone, { color: c.subText }]} numberOfLines={1}>
                                    {item._normPhone || item.phone}
                                  </Text>
                                </View>

                                <View style={{ alignItems: "flex-start" }}>
                                  <View style={[s.statusPill, { borderColor: st.c, backgroundColor: st.c + "14" }]}>
                                    <MaterialCommunityIcons name={st.i} size={16} color={st.c} />
                                    <Text style={[s.statusPillTxt, { color: st.c }]}>{st.t}</Text>
                                  </View>

                                  <Text style={[s.statusUpdated, { color: c.subText }]}>
                                    עודכן: {item._updated ? fmtShortDT(item._updated) : "—"}
                                  </Text>
                                </View>
                              </View>
                            );
                          }}
                        />
                      )}
                    </View>

                    <View style={[s.infoBox, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                      <Text style={[s.infoTxt, { color: c.subText }]}>
                        קהל יעד: <Text style={{ color: c.text, fontWeight: "900" }}>{people.length}</Text> נמענים
                      </Text>

                      <Text style={[s.infoTxt, { color: c.subText }]}>
                        מצב:{" "}
                        <Text style={{ color: c.text, fontWeight: "900" }}>
                          {activeProject?.sendMode === "now" ? "שלח עכשיו" : `מתוזמן (${fmtShortDT(activeProject?.scheduleISO)})`}
                        </Text>
                      </Text>

                      <Text style={[s.infoTxt, { color: c.subText }]}>
                        פרויקט: <Text style={{ color: c.text }}>{eventIdShown}</Text>
                      </Text>
                    </View>

                    {/* Schedule button */}
<TouchableOpacity style={[s.secondaryBtn, { borderColor: c.chipBorder }]} onPress={openScheduleModal}>
  <Ionicons name="calendar-outline" size={18} color={c.text} />
  <View style={{ alignItems: "center" }}>
    <Text style={[s.secondaryBtnTxt, { color: c.text }]}>תזמון / מצב שליחה</Text>
    <Text style={{ color: c.subText, fontWeight: "900", fontSize: 11, marginTop: 2 }}>{scheduleBtnSub}</Text>
  </View>
</TouchableOpacity>


                    {/* ✅ Send Now */}
                    <TouchableOpacity
                      style={[s.nowBtn, !people.length && { opacity: 0.45 }]}
                      disabled={!people.length}
                      onPress={() => sendCampaign("now")}
                    >
                      <LinearGradient
                        colors={[c.success, c.isDark ? "#047857" : "#059669"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                      <Text style={s.launchBtnTxt}>שלח עכשיו</Text>
                      <Ionicons name="flash-outline" size={18} color="#fff" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    {/* Scheduled send */}
                    <TouchableOpacity
                      style={[s.launchBtn, !people.length && { opacity: 0.45 }]}
                      disabled={!people.length}
                      onPress={() => sendCampaign("schedule")}
                    >
                      <LinearGradient
                        colors={[c.accent, c.isDark ? "#1d4ed8" : "#1e40af"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                      <Text style={s.launchBtnTxt}>שגר לפי תזמון</Text>
                      <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* PEOPLE */}
              {tab === "people" && (
                <View style={[s.cardBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
                  <View style={s.cardHeader}>
                    <Ionicons name="people-outline" size={18} color={c.subText} />
                    <Text style={[s.cardTitle, { color: c.text }]}>ניהול קהלים ({people.length})</Text>
                  </View>

                  <View style={s.actionsRow}>
                    <TouchableOpacity style={[s.actionChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]} onPress={importFromExcel}>
                      <MaterialCommunityIcons name="file-excel-outline" size={18} color={c.success} />
                      <Text style={[s.actionChipTxt, { color: c.text }]}>טען אקסל</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[s.actionChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]} onPress={() => setManualModal(true)}>
                      <Ionicons name="person-add-outline" size={18} color={c.accent} />
                      <Text style={[s.actionChipTxt, { color: c.text }]}>הוסף ידנית</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[s.actionChip, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]} onPress={downloadExcelTemplate}>
                      <Ionicons name="download-outline" size={18} color={c.warn} />
                      <Text style={[s.actionChipTxt, { color: c.text }]}>תבנית</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[s.divider, { backgroundColor: c.cardBorder }]} />

                  {people.length === 0 ? (
                    <View style={s.emptyState}>
                      <Ionicons name="file-tray-outline" size={40} color={c.subText} />
                      <Text style={[s.emptyTxt, { color: c.subText }]}>הקהל ריק כרגע</Text>
                    </View>
                  ) : (
                    people.map((p) => (
                      <View key={p.id} style={[s.personRow, { borderBottomColor: c.cardBorder }]}>
                        <View>
                          <Text style={[s.personName, { color: c.text }]}>{p.name}</Text>
                          <Text style={[s.personPhone, { color: c.subText }]}>{p.phone}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removePerson(p.id)} style={{ padding: 8 }}>
                          <Ionicons name="trash-outline" size={18} color={c.subText} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* HISTORY */}
{tab === "history" && (
  <View style={[s.cardBox, { backgroundColor: c.cardBg, borderColor: c.cardBorder }]}>
    <View style={s.cardHeader}>
      <Ionicons name="analytics-outline" size={18} color={c.subText} />
      <Text style={[s.cardTitle, { color: c.text }]}>היסטוריית שליחות</Text>
    </View>

    {/* Calendar */}
    <View style={[s.histCalendarWrap, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
      <Calendar
        current={histDay}
        onDayPress={(day) => setHistDay(day.dateString)}
        markedDates={historyMarkedDates}
        markingType={"custom"}
        theme={{
          calendarBackground: "transparent",
          dayTextColor: c.text,
          monthTextColor: c.text,
          textMonthFontWeight: "900",
          textDayFontWeight: "800",
          textDayHeaderFontWeight: "900",
          arrowColor: c.accent,
          todayTextColor: c.warn,
          textDisabledColor: c.muted,
        }}
        style={{ backgroundColor: "transparent" }}
      />
      <Text style={{ color: c.subText, fontWeight: "900", textAlign: "right", marginTop: 8 }}>
        נבחר: <Text style={{ color: c.text }}>{histDay}</Text>
      </Text>
    </View>

    {/* Batch cards */}
    {batchesByDay.length === 0 ? (
      <View style={s.emptyState}>
        <Ionicons name="time-outline" size={40} color={c.subText} />
        <Text style={[s.emptyTxt, { color: c.subText }]}>אין שליחות ביום הזה</Text>
      </View>
    ) : (
      <View style={{ marginTop: 12 }}>
        {batchesByDay.map((b) => {
          const when = fmtShortDT(b.latestISO || b.scheduleISO);
          const idLabel = b.bid.startsWith("single_") ? "שליחה בודדת" : `סבב ${shortBatchId(b.bid)}`;

          return (
            <TouchableOpacity
              key={b.bid}
              activeOpacity={0.92}
              onPress={() => {
                setActiveBatch(b);
                setBatchModal(true);
              }}
              style={[s.batchCard, { backgroundColor: c.isDark ? "rgba(15,23,42,0.42)" : "rgba(255,255,255,0.75)", borderColor: c.cardBorder }]}
            >
              <View style={s.batchTop}>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.batchTitle, { color: c.text }]}>{idLabel}</Text>
                  <Text style={[s.batchSub, { color: c.subText }]}>{when}</Text>
                </View>

                <View style={s.batchCounts}>
                  <View style={[s.countPill, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                    <Ionicons name="people-outline" size={14} color={c.text} />
                    <Text style={{ color: c.text, fontWeight: "900" }}>{b.total}</Text>
                  </View>

                  <View style={[s.countPill, { backgroundColor: c.success + "18", borderColor: c.success + "55" }]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={c.success} />
                    <Text style={{ color: c.success, fontWeight: "900" }}>{b.stats.sent}</Text>
                  </View>

                  <View style={[s.countPill, { backgroundColor: c.warn + "18", borderColor: c.warn + "55" }]}>
                    <Ionicons name="time-outline" size={14} color={c.warn} />
                    <Text style={{ color: c.warn, fontWeight: "900" }}>{b.stats.pending}</Text>
                  </View>

                  <View style={[s.countPill, { backgroundColor: c.danger + "18", borderColor: c.danger + "55" }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={c.danger} />
                    <Text style={{ color: c.danger, fontWeight: "900" }}>{b.stats.error}</Text>
                  </View>
                </View>
              </View>

              <View style={[s.batchMsgBox, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder }]}>
                <Text numberOfLines={3} style={{ color: c.text, textAlign: "right", fontWeight: "800", opacity: 0.95 }}>
                  {b.message || "—"}
                </Text>
              </View>

              <View style={s.batchBottom}>
                <Text style={{ color: c.subText, fontWeight: "900" }}>
                  לחץ לצפייה בנמענים + סטטוסים
                </Text>
                <Ionicons name="chevron-back" size={18} color={c.subText} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    )}
  </View>
)}

            </ScrollView>
          </KeyboardAvoidingView>

          {/* BUSY OVERLAY */}
          <Modal visible={busy} transparent animationType="fade">
            <View style={[s.modalOverlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
              <View style={[s.busyBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
                <ActivityIndicator size="large" color={c.accent} />
                <Text style={{ color: c.text, marginTop: 10, fontWeight: "800" }}>מבצע פעולה...</Text>
              </View>
            </View>
          </Modal>

          {/* RENAME PROJECT MODAL */}
          <Modal visible={renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(false)}>
            <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
              <View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
                <Text style={[s.modalTitle, { color: c.text }]}>שינוי שם כרטיס</Text>

                <TextInput
                  style={[s.modalInput, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder, color: c.text }]}
                  placeholder="שם חדש..."
                  placeholderTextColor={c.fieldPlaceholder}
                  value={renameValue}
                  onChangeText={setRenameValue}
                />

                <View style={s.row}>
                  <TouchableOpacity
                    style={[s.modalBtn, { backgroundColor: c.isDark ? "#334155" : "#e2e8f0" }]}
                    onPress={() => setRenameModal(false)}
                  >
                    <Text style={[s.modalBtnTxt, { color: c.isDark ? "#fff" : "#0f172a" }]}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.modalBtn, { backgroundColor: c.accent }]} onPress={confirmRename}>
                    <Text style={[s.modalBtnTxt, { color: "#fff" }]}>שמור</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* MANUAL ADD MODAL */}
          <Modal visible={manualModal} transparent animationType="fade" onRequestClose={() => setManualModal(false)}>
            <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
              <View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
                <Text style={[s.modalTitle, { color: c.text }]}>הוספת נמען</Text>

                <TextInput
                  style={[s.modalInput, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder, color: c.text }]}
                  placeholder="שם מלא"
                  placeholderTextColor={c.fieldPlaceholder}
                  value={manualName}
                  onChangeText={setManualName}
                />

                <TextInput
                  style={[s.modalInput, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder, color: c.text }]}
                  placeholder="טלפון (למשל 052...)"
                  placeholderTextColor={c.fieldPlaceholder}
                  value={manualNumber}
                  onChangeText={setManualNumber}
                  keyboardType="numeric"
                />

                <View style={s.row}>
                  <TouchableOpacity
                    style={[s.modalBtn, { backgroundColor: c.isDark ? "#334155" : "#e2e8f0" }]}
                    onPress={() => setManualModal(false)}
                  >
                    <Text style={[s.modalBtnTxt, { color: c.isDark ? "#fff" : "#0f172a" }]}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.modalBtn, { backgroundColor: c.accent }]} onPress={addManualPerson}>
                    <Text style={[s.modalBtnTxt, { color: "#fff" }]}>הוסף</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* SCHEDULE MODAL */}
          <Modal visible={scheduleModal} transparent animationType="fade" onRequestClose={() => setScheduleModal(false)}>
            <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
<View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
  <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView
      style={{ maxHeight: Platform.OS === "web" ? "75vh" : undefined }}
      contentContainerStyle={{ paddingBottom: 14 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >                <Text style={[s.modalTitle, { color: c.text }]}>הגדרות שליחה</Text>

                <View style={s.segRow}>
                  <SegBtn active={draftMode === "now"} icon="flash-outline" text="שלח עכשיו" onPress={() => setDraftMode("now")} c={c} s={s} />
                  <SegBtn active={draftMode === "schedule"} icon="calendar-outline" text="תזמון" onPress={() => setDraftMode("schedule")} c={c} s={s} />
                </View>
                {draftMode === "schedule" && (
  <>
    {/* Calendar picker */}
    <View style={[s.schedCalendarWrap, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
      <Calendar
        current={draftDate}
        onDayPress={(day) => setDraftDate(day.dateString)}
        markedDates={{
          [draftDate]: {
            selected: true,
            selectedColor: c.accent,
            selectedTextColor: "#fff",
          },
        }}
        theme={{
          calendarBackground: "transparent",
          dayTextColor: c.text,
          monthTextColor: c.text,
          textMonthFontWeight: "900",
          textDayFontWeight: "800",
          textDayHeaderFontWeight: "900",
          arrowColor: c.accent,
          todayTextColor: c.warn,
          textDisabledColor: c.muted,
        }}
        style={{ backgroundColor: "transparent" }}
      />
    </View>

    {/* Time presets */}
    <Text style={{ color: c.subText, fontWeight: "900", textAlign: "right", marginTop: 12, marginBottom: 8 }}>
      בחר שעה
    </Text>


<View style={[s.timeTextRow, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder }]}>
  <Ionicons name="time-outline" size={18} color={c.muted} style={{ marginLeft: 10 }} />
  <TextInput
    value={draftTimeText}
    onChangeText={(t) => {
      // מאפשר רק ספרות ונקודתיים
      const cleaned = String(t || "").replace(/[^\d:]/g, "").slice(0, 5);
      setDraftTimeText(cleaned);

      // אם בפורמט תקין HH:mm -> נעדכן את draftTime
      if (/^\d{2}:\d{2}$/.test(cleaned)) {
        const [hh, mm] = cleaned.split(":").map(Number);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
          const fixed = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
          setDraftTime(fixed);
        }
      }
    }}
    placeholder="הקלד שעה (HH:mm) למשל 21:30"
    placeholderTextColor={c.fieldPlaceholder}
    keyboardType="numeric"
    style={[s.timeTextInput, { color: c.text }]}
  />
</View>


    <View style={s.timeGrid}>
      {["08:00","09:00","10:00","12:00","14:00","16:00","18:00","20:00","21:30","23:00"].map((t) => {
        const active = draftTime === t;
        return (
          <TouchableOpacity
            key={t}
            activeOpacity={0.9}
onPress={() => {
  setDraftTime(t);
  setDraftTimeText(t);
}}
            style={[
              s.timeChip,
              { backgroundColor: active ? c.accent : c.fieldBg, borderColor: active ? c.accent : c.fieldBorder },
            ]}
          >
            <Text style={{ color: active ? "#fff" : c.text, fontWeight: "900" }}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </View>

    {/* Quick relative presets */}
    <Text style={{ color: c.subText, fontWeight: "900", textAlign: "right", marginTop: 12, marginBottom: 8 }}>
      הצעות מהירות
    </Text>

    <View style={s.quickRow}>
      <QuickChip text="עוד 5 דק׳" onPress={() => bumpMinutes(5)} c={c} s={s} />
      <QuickChip text="עוד 10 דק׳" onPress={() => bumpMinutes(10)} c={c} s={s} />
      <QuickChip text="עוד 30 דק׳" onPress={() => bumpMinutes(30)} c={c} s={s} />
      <QuickChip text="עוד שעה" onPress={() => bumpMinutes(60)} c={c} s={s} />
      <QuickChip text="עוד 2 שעות" onPress={() => bumpMinutes(120)} c={c} s={s} />
      <QuickChip text="מחר 09:00" onPress={() => setTomorrowAt(9, 0)} c={c} s={s} />
      <QuickChip text="מחר 18:00" onPress={() => setTomorrowAt(18, 0)} c={c} s={s} />
    </View>

    {/* Countdown preview */}
    {(() => {
      const iso = combineDateAndTimeToISO(draftDate, draftTime);
      const ms = iso ? new Date(iso).getTime() : 0;
      const diff = ms ? ms - nowTick : 0;
      return (
        <View style={[s.previewBox, { backgroundColor: c.chipBg, borderColor: c.chipBorder, marginTop: 10 }]}>
          <Text style={[s.previewTxt, { color: c.subText }]}>
            תצוגה:{" "}
            <Text style={{ color: c.text, fontWeight: "900" }}>
              {iso ? fmtShortDT(iso) : "—"}
            </Text>
          </Text>
          <Text style={[s.previewTxt, { color: c.subText, marginTop: 6 }]}>
            ספירה לאחור:{" "}
            <Text style={{ color: c.text, fontWeight: "900" }}>
              {ms && diff > 0 ? fmtCountdown(diff) : "—"}
            </Text>
          </Text>
        </View>
      );
    })()}
  </>
)}


                {draftMode === "now" && (
                  <View style={[s.previewBox, { backgroundColor: c.chipBg, borderColor: c.chipBorder }]}>
                    <Text style={[s.previewTxt, { color: c.subText }]}>
                      ההודעות ייווצרו עם <Text style={{ color: c.text, fontWeight: "900" }}>scheduleMessage = עכשיו</Text>
                    </Text>
                  </View>
                )}

                <View style={s.row}>
                  <TouchableOpacity
                    style={[s.modalBtn, { backgroundColor: c.isDark ? "#334155" : "#e2e8f0" }]}
                    onPress={() => setScheduleModal(false)}
                  >
                    <Text style={[s.modalBtnTxt, { color: c.isDark ? "#fff" : "#0f172a" }]}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.modalBtn, { backgroundColor: c.accent }]} onPress={applyScheduleDraft}>
                    <Text style={[s.modalBtnTxt, { color: "#fff" }]}>שמור</Text>
                  </TouchableOpacity>
                </View>
                 </ScrollView>
  </KeyboardAvoidingView>
</View>
            </View>
          </Modal>

          {/* PREVIEW MODAL */}
          <Modal visible={previewModal} transparent animationType="fade" onRequestClose={() => setPreviewModal(false)}>
            <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
              <View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
                <Text style={[s.modalTitle, { color: c.text }]}>תצוגה מקדימה</Text>

                <View style={{ backgroundColor: c.fieldBg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.fieldBorder, marginVertical: 10 }}>
                  <Text style={{ color: c.text, textAlign: "right" }}>{previewItem?.message || ""}</Text>
                </View>

                <TouchableOpacity
                  style={[s.modalBtn, { backgroundColor: c.isDark ? "#334155" : "#e2e8f0" }]}
                  onPress={() => setPreviewModal(false)}
                >
                  <Text style={[s.modalBtnTxt, { color: c.isDark ? "#fff" : "#0f172a" }]}>סגור</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* SERVERS MODAL (✅ בלי הכפתור המיותר ליד היציאה) */}
          <Modal visible={serversModal} transparent animationType="fade" onRequestClose={() => setServersModal(false)}>
            <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
              <View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
                <View style={s.servHeader}>
                  <Text style={[s.modalTitle, { color: c.text, marginBottom: 0 }]}>ניהול שרתים</Text>

                  <TouchableOpacity
                    style={[s.topIconBtn, { borderColor: c.fieldBorder, backgroundColor: c.fieldBg, width: 40, height: 40, borderRadius: 14 }]}
                    onPress={() => setServersModal(false)}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="close" size={18} color={c.text} />
                  </TouchableOpacity>
                </View>

                <View style={[s.previewBox, { backgroundColor: c.chipBg, borderColor: c.chipBorder, marginTop: 14 }]}>
                  <Text style={[s.previewTxt, { color: c.subText }]}>בקרוב: סטטוס שרתים, מכסה יומית, ועוד.</Text>
                </View>
              </View>
            </View>
          </Modal>

          {/* BATCH DETAILS MODAL */}
<Modal visible={batchModal} transparent animationType="fade" onRequestClose={() => setBatchModal(false)}>
  <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
    <View style={[s.modalBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder, maxWidth: 520 }]}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.modalTitle, { color: c.text, marginBottom: 0 }]}>
            {activeBatch?.bid?.startsWith("single_") ? "שליחה בודדת" : `סבב ${shortBatchId(activeBatch?.bid)}`}
          </Text>
          <Text style={{ color: c.subText, fontWeight: "900", marginTop: 6 }}>
            {activeBatch?.latestISO ? fmtShortDT(activeBatch.latestISO) : "—"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setBatchModal(false)}
          activeOpacity={0.9}
          style={[s.topIconBtn, { borderColor: c.fieldBorder, backgroundColor: c.fieldBg, width: 40, height: 40, borderRadius: 14 }]}
        >
          <Ionicons name="close" size={18} color={c.text} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={[s.batchSummaryRow, { borderColor: c.cardBorder, backgroundColor: c.chipBg }]}>
        <Text style={{ color: c.text, fontWeight: "900" }}>נמענים: {activeBatch?.total || 0}</Text>
        <Text style={{ color: c.success, fontWeight: "900" }}>נשלח: {activeBatch?.stats?.sent || 0}</Text>
        <Text style={{ color: c.warn, fontWeight: "900" }}>ממתין: {activeBatch?.stats?.pending || 0}</Text>
        <Text style={{ color: c.danger, fontWeight: "900" }}>שגיאה: {activeBatch?.stats?.error || 0}</Text>
      </View>

      {/* Full message */}
      <View style={[s.batchMsgBox, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder, marginTop: 12 }]}>
        <Text style={{ color: c.text, textAlign: "right", fontWeight: "800" }}>
          {String(activeBatch?.message || "").trim() || "—"}
        </Text>
      </View>

      {/* Recipients list */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: c.subText, fontWeight: "900", textAlign: "right", marginBottom: 8 }}>
          נמענים וסטטוס (לחיצה לא נדרשת)
        </Text>

        <FlatList
          data={(activeBatch?.items || []).slice().sort((a, b) => {
            // sort: error -> pending -> sending -> sent, then newest update
            const rank = (st) => {
              const s = String(st || "").toLowerCase();
              if (s === "error" || s === "failed") return 0;
              if (s === "pending") return 1;
              if (s === "sending" || s === "processing") return 2;
              if (s === "sent") return 3;
              return 9;
            };
            const ra = rank(a.status);
            const rb = rank(b.status);
            if (ra !== rb) return ra - rb;
            return isoToMs(pickMsgISO(b)) - isoToMs(pickMsgISO(a));
          })}
          keyExtractor={(it) => it.id}
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ paddingBottom: 6 }}
          renderItem={({ item }) => {
            const st = prettyStatus(item.status);
            const upd = item.updatedAt || item.sentAt || item.createdAt || item.scheduleMessage || "";
            return (
              <View style={[s.recRow, { borderBottomColor: c.cardBorder }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "900", textAlign: "right" }} numberOfLines={1}>
                    {item.recipientName || "—"}
                  </Text>
                  <Text style={{ color: c.subText, fontWeight: "800", textAlign: "right", marginTop: 2 }} numberOfLines={1}>
                    {item.formattedContacts}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-start" }}>
                  <View style={[s.statusPill, { borderColor: st.c, backgroundColor: st.c + "14" }]}>
                    <MaterialCommunityIcons name={st.i} size={16} color={st.c} />
                    <Text style={[s.statusPillTxt, { color: st.c }]}>{st.t}</Text>
                  </View>

                  <Text style={{ color: c.subText, fontWeight: "800", fontSize: 10, marginTop: 6, textAlign: "right" }}>
                    עודכן: {upd ? fmtShortDT(upd) : "—"}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      </View>
    </View>
  </View>
</Modal>
<Modal
  visible={deleteProjModal}
  transparent
  animationType="fade"
  onRequestClose={closeDeleteProject}
>
  <View style={[s.modalOverlay, { backgroundColor: c.modalOverlay }]}>
    <View style={[s.confirmBox, { backgroundColor: c.modalBg, borderColor: c.modalBorder }]}>
      <View style={[s.confirmIconWrap, { backgroundColor: c.danger + "18", borderColor: c.danger + "55" }]}>
        <Ionicons name="trash-outline" size={22} color={c.danger} />
      </View>

      <Text style={[s.confirmTitle, { color: c.text }]}>למחוק את הכרטיסיה?</Text>

      <Text style={[s.confirmSub, { color: c.subText }]}>
        הפעולה לא ניתנת לשחזור.{"\n"}
        {(() => {
          const p = projects.find((x) => x.id === deletePid);
          return p?.name ? `כרטיסיה: ${p.name}` : "";
        })()}
      </Text>

      <View style={s.confirmBtnsRow}>
        <TouchableOpacity
          onPress={closeDeleteProject}
          activeOpacity={0.9}
          style={[s.confirmBtn, { backgroundColor: c.isDark ? "#334155" : "#e2e8f0" }]}
        >
          <Text style={[s.confirmBtnTxt, { color: c.isDark ? "#fff" : "#0f172a" }]}>ביטול</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={confirmDeleteProject}
          activeOpacity={0.9}
          style={[s.confirmBtn, { overflow: "hidden" }]}
        >
          <LinearGradient
            colors={[c.danger, c.isDark ? "#b91c1c" : "#dc2626"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <Text style={[s.confirmBtnTxt, { color: "#fff" }]}>מחק</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>

        </Animated.View>
      </LinearGradient>
    </>
  );
}

// ---------------- Styles ----------------
function makeStyles() {
  return StyleSheet.create({
    container: { flex: 1 },
    scrollBody: { padding: 16, paddingBottom: 40 },

    // Header
    header: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
    },
    appName: { fontSize: 20, fontWeight: "900", letterSpacing: 1 },
    appSub: { fontSize: 12, fontWeight: "700", marginTop: 2 },
    headerRight: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    topIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      overflow: "hidden",
    },
    logoutBtn: {
      padding: 7,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: "rgba(239,68,68,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },

    // Projects Tab Bar
    projectsBar: {
      flexDirection: "row-reverse",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 10,
    },
    addProjBtn: {
      width: 36,
      height: 36,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    projectTab: {
      flexDirection: "row-reverse",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      maxWidth: 220,
      gap: 8,
    },
    projectTabTxt: { fontSize: 13, fontWeight: "900", maxWidth: 140, textAlign: "right" },
    smallIcon: { padding: 2 },

    // Stats
    statsGrid: { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
    statPill: {
      flex: 1,
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      borderRadius: 14,
      padding: 12,
      borderLeftWidth: 3,
      borderWidth: 1,
    },
    statContent: { alignItems: "flex-end" },
    statValue: { fontSize: 18, fontWeight: "900" },
    statLabel: { fontSize: 11, fontWeight: "800" },
    statIconObj: { padding: 7, borderRadius: 10 },

    // Nav Tabs
    navTabs: {
      flexDirection: "row-reverse",
      marginHorizontal: 16,
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
      borderWidth: 1,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
      overflow: "hidden",
    },
    tabTxt: { fontSize: 13, fontWeight: "800" },
    activeTabIndicator: { position: "absolute", bottom: 0, width: "44%", height: 2, borderRadius: 2 },

    // Layout + Cards
    splitView: { flexDirection: "row-reverse", gap: 16, flex: 1, alignItems: "flex-start" },
    cardBox: {
      flex: 1,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      marginBottom: 16,
      overflow: "hidden",
    },
    cardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
    cardTitle: { fontWeight: "900", fontSize: 14 },

    // Inputs
    textGroup: {
      borderRadius: 14,
      padding: 12,
      minHeight: 130,
      textAlign: "right",
      textAlignVertical: "top",
      borderWidth: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    inputGroup: {
      flexDirection: "row-reverse",
      alignItems: "center",
      borderRadius: 14,
      marginTop: 10,
      borderWidth: 1,
    },
    inputClean: { flex: 1, padding: 12, textAlign: "right", fontSize: 13, fontWeight: "800" },
    row: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
    iconBtn: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    divider: { height: 1, marginVertical: 16 },

    // Templates List
    tplRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
    },
    tplName: { fontWeight: "900", fontSize: 13, textAlign: "right" },
    tplSub: { fontSize: 12, textAlign: "right", marginTop: 2, fontWeight: "700" },

    // Sidebar Controls
    infoBox: { borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1 },
    infoTxt: { fontSize: 12, textAlign: "right", marginBottom: 4, fontWeight: "800" },
    secondaryBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      gap: 8,
      marginBottom: 12,
    },
    secondaryBtnTxt: { fontWeight: "900", fontSize: 13 },

    nowBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      padding: 14,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 12,
    },
    launchBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      borderRadius: 16,
      overflow: "hidden",
    },
    launchBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 16, zIndex: 1 },

    // ✅ Audience box
    audienceBox: {
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      marginBottom: 12,
    },
    audienceHead: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
    },
    audienceTitle: { fontWeight: "900", fontSize: 13 },
    audienceCount: { fontWeight: "900", fontSize: 13 },

    sortBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    sortBtnTxt: { fontWeight: "900", fontSize: 11 },

    audienceRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      gap: 10,
    },
    audienceName: { fontWeight: "900", fontSize: 13, textAlign: "right" },
    audiencePhone: { fontWeight: "800", fontSize: 11, textAlign: "right", marginTop: 2 },

    statusPill: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
    statusPillTxt: { fontWeight: "900", fontSize: 12 },
    statusUpdated: { fontWeight: "800", fontSize: 10, textAlign: "right", marginTop: 6 },

    // People
    actionsRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
    actionChip: {
      flexDirection: "row-reverse",
      alignItems: "center",
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
    },
    actionChipTxt: { fontSize: 12, fontWeight: "900" },
    personRow: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    personName: { fontWeight: "900", fontSize: 13, textAlign: "right" },
    personPhone: { fontSize: 12, textAlign: "right", marginTop: 2, fontWeight: "700" },
    emptyState: { alignItems: "center", padding: 22, opacity: 0.9 },
    emptyTxt: { marginTop: 10, fontWeight: "800" },

    // History Log
    logRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 12, gap: 10, borderBottomWidth: 1 },
    statusDot: { width: 9, height: 9, borderRadius: 5 },
    logName: { fontSize: 13, fontWeight: "900", textAlign: "right" },
    logTime: { fontSize: 11, textAlign: "right", marginTop: 2, fontWeight: "700" },
    dayChip: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 8,
      alignItems: "center",
    },
    dayChipTxt: { fontSize: 12, fontWeight: "900" },
    badge: { backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    badgeTxt: { color: "#fff", fontSize: 10, fontWeight: "900" },

    // Modals
    modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    modalBox: { width: "100%", maxWidth: 460, borderRadius: 18, padding: 18, borderWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 14 },
    modalInput: {
      padding: 12,
      borderRadius: 12,
      marginBottom: 12,
      textAlign: "right",
      borderWidth: 1,
      fontWeight: "800",
    },
    modalBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
    modalBtnTxt: { fontWeight: "900" },

    // Busy
    busyBox: { width: 220, padding: 18, borderRadius: 18, borderWidth: 1, alignItems: "center" },

    // Schedule UI
    segRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 14 },
    segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
    segTxt: { fontWeight: "900" },

    dtRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 10 },
    dtField: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
    dtInput: { flex: 1, textAlign: "right", fontWeight: "900" },

    quickRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 10 },
    quickChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
    quickChipTxt: { fontWeight: "900" },

    previewBox: { padding: 12, borderRadius: 14, borderWidth: 1 },
    previewTxt: { textAlign: "right", fontWeight: "800" },
    histCalendarWrap: {
  borderRadius: 16,
  padding: 10,
  borderWidth: 1,
},

batchCard: {
  borderRadius: 18,
  padding: 14,
  borderWidth: 1,
  marginBottom: 12,
},
batchTop: {
  flexDirection: "row-reverse",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
},
batchTitle: { fontSize: 14, fontWeight: "900", textAlign: "right" },
batchSub: { fontSize: 11, fontWeight: "800", textAlign: "right", marginTop: 4 },
batchCounts: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" },
countPill: {
  flexDirection: "row-reverse",
  alignItems: "center",
  gap: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 999,
  borderWidth: 1,
},
batchMsgBox: {
  borderRadius: 14,
  padding: 12,
  borderWidth: 1,
  marginTop: 12,
},
batchBottom: {
  marginTop: 12,
  flexDirection: "row-reverse",
  alignItems: "center",
  justifyContent: "space-between",
},

batchSummaryRow: {
  marginTop: 14,
  borderRadius: 14,
  borderWidth: 1,
  padding: 10,
  flexDirection: "row-reverse",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 10,
},

recRow: {
  flexDirection: "row-reverse",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 12,
  borderBottomWidth: 1,
  gap: 12,
},

schedCalendarWrap: {
  borderRadius: 16,
  padding: 10,
  borderWidth: 1,
},
timeTextRow: {
  flexDirection: "row-reverse",
  alignItems: "center",
  borderRadius: 14,
  borderWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 8,
  marginBottom: 10,
},
timeTextInput: {
  flex: 1,
  paddingVertical: 8,
  paddingHorizontal: 10,
  textAlign: "right",
  fontWeight: "900",
  fontSize: 13,
},

timeGrid: {
  flexDirection: "row-reverse",
  flexWrap: "wrap",
  gap: 8,
},
timeChip: {
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 14,
  borderWidth: 1,
  minWidth: 86,
  alignItems: "center",
},
confirmBox: {
  width: "100%",
  maxWidth: 420,
  borderRadius: 20,
  padding: 18,
  borderWidth: 1,
  alignItems: "center",
},

confirmIconWrap: {
  width: 52,
  height: 52,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  marginBottom: 10,
},

confirmTitle: {
  fontSize: 18,
  fontWeight: "900",
  textAlign: "center",
  marginBottom: 6,
},

confirmSub: {
  fontSize: 12,
  fontWeight: "800",
  textAlign: "center",
  lineHeight: 18,
  marginBottom: 14,
},

confirmBtnsRow: {
  flexDirection: "row-reverse",
  gap: 10,
  width: "100%",
},

confirmBtn: {
  flex: 1,
  height: 46,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
},

confirmBtnTxt: {
  fontWeight: "900",
  fontSize: 14,
},

    // Servers
    servHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  });
}
