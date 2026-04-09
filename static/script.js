import { auth } from "/static/firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ROUTES
window.goSignup = () => window.location = "/signup";
window.goLogin  = () => window.location = "/";

// ================= DEVICE =================
function getDevice() {
  if (
    navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  ) return "Mobile";
  return "Laptop";
}

// ================= LOCATION (VPN-proof, 4-API chain) =================
// Each API returns the VPN EXIT country when a VPN is active.
async function getLocation() {
  // Method 1: ipify → ipapi.co (most reliable with VPN)
  try {
    const ipRes  = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    const res    = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
    const data   = await res.json();
    if (data.country_name) return data.country_name;
  } catch {}

  // Method 2: ipwho.is fallback
  try {
    const res  = await fetch("https://ipwho.is/", { cache: "no-store" });
    const data = await res.json();
    if (data.success && data.country) return data.country;
  } catch {}

  return "Unknown"; // ← NOT "India", so ML treats it as foreign = risky
}
    
  

// ================= SIGNUP =================
window.signup = async () => {
  const username = document.getElementById("username").value.trim();
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const { db }   = await import("/static/firebase.js");
    await setDoc(doc(db, "users", userCred.user.uid), { username, email });
    alert("Account created!");
    window.location = "/";
  } catch (e) {
    document.getElementById("msg").innerText = e.message;
  }
};

// ================= LOGIN =================
window.login = async () => {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Read current session failed attempts BEFORE attempting login
  let failedAttempts = parseInt(localStorage.getItem(email + "_failedAttempts")) || 0;

  // ── STEP 1: Authenticate with Firebase ──────────────────────────────────
  // Separate try/catch ONLY for auth — so wrong password is the ONLY
  // thing that ever increments failedAttempts.
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, email, password);
  } catch (authError) {
    // ✅ Password was actually wrong — increment
    failedAttempts++;
    localStorage.setItem(email + "_failedAttempts", failedAttempts);
    document.getElementById("msg").innerText = "Login failed ❌ (" + failedAttempts + ")";
    return; // stop — don't run any post-login code
  }

  // ── STEP 2: Auth succeeded — IMMEDIATELY reset failed attempts ───────────
  // Save snapshot of how many failed attempts happened this session
  const sessionFailedAttempts = failedAttempts;
  // Reset RIGHT NOW so even if anything below errors, it won't keep climbing
  localStorage.setItem(email + "_failedAttempts", 0);

  // Store identity for otp.js
  localStorage.setItem("email", userCred.user.email);
  localStorage.setItem("uid",   userCred.user.uid);

  // ── STEP 3: Collect context (non-critical, won't affect login flow) ──────
  let device   = getDevice();
  let location = "Unknown";
  let time     = new Date().toLocaleTimeString();

  try {
    location = await getLocation();
    time     = new Date().toLocaleTimeString();
  } catch {}

  // ── STEP 4: Get loginCount from Firestore ────────────────────────────────
  let loginCount = 1;
  try {
    const { db } = await import("/static/firebase.js");
    const ref    = doc(db, "activity", userCred.user.uid);
    const snap   = await getDoc(ref);
    loginCount   = snap.exists() ? (snap.data().loginCount || 0) + 1 : 1;
  } catch {}

  // Save all pending data for otp.js to use after OTP verification
  localStorage.setItem("pendingDevice",         device);
  localStorage.setItem("pendingLocation",       location);
  localStorage.setItem("pendingTime",           time);
  localStorage.setItem("pendingLoginCount",     loginCount);
  localStorage.setItem("pendingFailedAttempts", sessionFailedAttempts);

  // ── STEP 5: ML Prediction ────────────────────────────────────────────────
  let prediction = 0; // default to safe if /predict unreachable
  try {
    const res    = await fetch("/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        device,
        location,
        loginCount,
        failedAttempts: sessionFailedAttempts,
        time
      })
    });
    const result = await res.json();
    if (typeof result.prediction === "number") {
      prediction = result.prediction;
    }
  } catch {}

  // ── STEP 6: Route based on prediction ───────────────────────────────────
  if (prediction === 0) {
    // SAFE — save activity and go home
    try {
      const { db } = await import("/static/firebase.js");
      const ref    = doc(db, "activity", userCred.user.uid);
      await setDoc(ref, {
        email,
        location,
        device,
        date:           new Date().toISOString().split("T")[0],
        time,
        loginCount,
        failedAttempts: sessionFailedAttempts  // overwrite with THIS session's count
      });
    } catch {}

    window.location = "/home";

  } else {
    // RISKY — send OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem("otp",     otp);
    localStorage.setItem("otpTime", Date.now());

    try {
      await fetch("/send-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: userCred.user.email, otp })
      });
    } catch {}

    window.location = "/otp";
  }
};
