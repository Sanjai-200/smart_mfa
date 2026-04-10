import { auth } from "/static/firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";


window.goSignup = () => window.location = "/signup";
window.goLogin  = () => window.location = "/";


function getDevice() {
  if (
    navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  ) return "Mobile";
  return "Laptop";
}


async function getLocation() {
  
  try {
    const ipRes  = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    const res    = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
    const data   = await res.json();
    if (data.country_name) return data.country_name;
  } catch {}


  try {
    const res  = await fetch("https://ipwho.is/", { cache: "no-store" });
    const data = await res.json();
    if (data.success && data.country) return data.country;
  } catch {}

  return "Unknown";
}


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


window.login = async () => {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const msgEl    = document.getElementById("msg");

  
  let failedAttempts = parseInt(sessionStorage.getItem(email + "_failedAttempts")) || 0;

  
  msgEl.innerText = "Checking credentials...";
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, email, password);

  } catch (authError) {
    const code = authError.code;

    
    if (code === "auth/too-many-requests") {
      localStorage.setItem(email + "_pendingFailed", failedAttempts);
      sessionStorage.setItem(email + "_failedAttempts", 0);
      msgEl.innerText = "⚠️ Too many attempts. Please refresh the page and try again.";
      return;
    }


    failedAttempts++;
    sessionStorage.setItem(email + "_failedAttempts", failedAttempts);


    if (failedAttempts >= 4) {
      localStorage.setItem(email + "_pendingFailed", failedAttempts);
      sessionStorage.setItem(email + "_failedAttempts", 0);
      msgEl.innerText = "⚠️ Too many attempts. Please refresh the page  & try again later .";
      return;
    }

    msgEl.innerText = "Login failed ❌ (" + failedAttempts + ")";
    return;
  }

  // ── STEP 2: Auth succeeded ───────────────────────────────────────────────
  // Check localStorage for failed attempts saved before refresh
  // This ensures the real count is fed to ML and stored in Firestore
  const pendingFailed = parseInt(localStorage.getItem(email + "_pendingFailed")) || 0;
  const sessionFailedAttempts = pendingFailed > 0 ? pendingFailed : failedAttempts;

  // Clear both storages — fresh start for next session
  sessionStorage.setItem(email + "_failedAttempts", 0);
  localStorage.removeItem(email + "_pendingFailed");

  // Store identity for otp.js
  localStorage.setItem("email", userCred.user.email);
  localStorage.setItem("uid",   userCred.user.uid);

  // ── STEP 3: Collect context ──────────────────────────────────────────────
  msgEl.innerText = "Getting location...";
  let device   = getDevice();
  let location = "Unknown";
  let time     = new Date().toLocaleTimeString();

  try {
    location = await getLocation();
    time     = new Date().toLocaleTimeString();
  } catch {}

  // ── STEP 4: loginCount from Firestore ───────────────────────────────────
  msgEl.innerText = "Loading profile...";
  let loginCount = 1;
  try {
    const { db } = await import("/static/firebase.js");
    const ref    = doc(db, "activity", userCred.user.uid);
    const snap   = await getDoc(ref);
    loginCount   = snap.exists() ? (snap.data().loginCount || 0) + 1 : 1;
  } catch {}

  // Save pending data for otp.js to use after OTP verification
  localStorage.setItem("pendingDevice",         device);
  localStorage.setItem("pendingLocation",       location);
  localStorage.setItem("pendingTime",           time);
  localStorage.setItem("pendingLoginCount",     loginCount);
  localStorage.setItem("pendingFailedAttempts", sessionFailedAttempts);

  // ── STEP 5: ML Prediction ────────────────────────────────────────────────
  msgEl.innerText = "Analysing risk...";
  let prediction = 0;
  try {
    const res    = await fetch("/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        device,
        location,
        loginCount,
        failedAttempts: sessionFailedAttempts,  // ✅ real count fed to ML
        time
      })
    });
    const result = await res.json();
    if (typeof result.prediction === "number") {
      prediction = result.prediction;
    }
  } catch (e) {
    msgEl.innerText = "⚠️ Predict error: " + e.message + " — redirecting...";
    setTimeout(() => window.location = "/home", 3000);
    return;
  }

  // ── STEP 6: Route based on prediction ───────────────────────────────────
  msgEl.innerText = " Prediction: " + prediction +
    (prediction === 0 ? " → Going Home..." : " → Sending OTP...");

  setTimeout(async () => {

    if (prediction === 0) {
      // SAFE — store activity and go home
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
          failedAttempts: sessionFailedAttempts  // ✅ real count stored in Firestore
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

  }, 3000);
};
