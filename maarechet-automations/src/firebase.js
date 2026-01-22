// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// ✅ החלף לפרטים שלך
const firebaseConfig = {
  apiKey: "AIzaSyChrAhuZGH22gwm0s8KEJPNq9JRx0l5UpM",
  authDomain: "maarechet-automations.firebaseapp.com",
  databaseURL: "https://maarechet-automations-default-rtdb.firebaseio.com",
  projectId: "maarechet-automations",
  storageBucket: "maarechet-automations.firebasestorage.app",
  messagingSenderId: "271575559700",
  appId: "1:271575559700:web:8ef1127096504730554101",
  measurementId: "G-3N87M3P43E"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
