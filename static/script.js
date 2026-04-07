import { auth } from "/static/firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ROUTES
window.goSignup = () => window.location = "/signup";
window.goLogin = () => window.location = "/";

// EMAIL VALIDATION
function isValidEmail(email) {
  const regex = /^[a-z0-9]+([._%+-]?[a-z0-9]+)*@[a-z0-9-]+\.[a-z]{2,}$/;

  if (!regex.test(email)) return false;
  if (email.includes("..") || email.includes("@.")) return false;

  const allowedDomains = ["gmail.com", "yahoo.com", "outlook.com"];
  return allowedDomains.includes(email.split("@")[1]);
}

// DEVICE
function getDevice() {
  if (
    navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.innerWidth <= 768
  ) return "Mobile";

  return "Laptop";
}

// LOCATION
async function getLocation() {
  try {
    let res = await fetch("https://ipwho.is/?t=" + Date.now(), { cache: "no-store" });
    let data = await res.json();
    if (data.success && data.country) return data.country;
  } catch {}

  return "India";
}

// ================= SIGNUP =================
window.signup = async () => {
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!isValidEmail(email)) {
    document.getElementById("msg").innerText = "Invalid email ❌";
    return;
  }

  try {
    const user = await createUserWithEmailAndPassword(auth, email, password);

    const { db } = await import("/static/firebase.js");
    await setDoc(doc(db, "users", user.user.uid), {
      username,
      email
    });

    alert("Account created successfully!");
    window.location = "/";

  } catch (e) {
    document.getElementById("msg").innerText = e.message;
  }
};

// ================= LOGIN =================
window.login = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // 🔥 per-user failedAttempts
  let failedAttempts = parseInt(localStorage.getItem(email + "_failedAttempts")) || 0;

  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);

    localStorage.setItem("uid", userCred.user.uid);
    localStorage.setItem("email", userCred.user.email);

    const device = getDevice();
    const location = await getLocation();
    const time = new Date().toLocaleTimeString();

    const { db } = await import("/static/firebase.js");
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js"
    );

    const ref = doc(db, "activity", userCred.user.uid);
    const snap = await getDoc(ref);

    let loginCount = 1;
    if (snap.exists()) {
      loginCount = (snap.data().loginCount || 0) + 1;
    }

    // 🔥 ML fallback protection
    let result = { prediction: 0 };

    try {
      const response = await fetch("/predict", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          device,
          location,
          loginCount,
          failedAttempts,
          time
        })
      });

      result = await response.json();

    } catch (e) {
      console.log("ML failed → fallback safe login", e);
    }

    // ✅ SAFE LOGIN
    if (result.prediction === 0) {

      await storeData(failedAttempts);

      localStorage.setItem(email + "_failedAttempts", 0);

      window.location = "/home";

    } 
    // ⚠️ RISK LOGIN
    else {

      localStorage.setItem(email + "_finalFailedAttempts", failedAttempts);

      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      localStorage.setItem("otp", otp);
      localStorage.setItem("otpTime", Date.now());

      await fetch("/send-otp", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          email: userCred.user.email,
          otp: otp
        })
      });

      alert("OTP sent to your email 📧");

      window.location = "/otp";
    }

  } catch (e) {

    // 🔥 specific error handling
    if (e.code === "auth/user-not-found") {
      document.getElementById("msg").innerText = "User not found ❌";
      return;
    }

    if (e.code === "auth/wrong-password") {
      failedAttempts++;
      localStorage.setItem(email + "_failedAttempts", failedAttempts);

      document.getElementById("msg").innerText =
        "Wrong password ❌ (" + failedAttempts + ")";
      return;
    }

    if (e.code === "auth/invalid-email") {
      document.getElementById("msg").innerText = "Invalid email format ❌";
      return;
    }

    // fallback
    failedAttempts++;
    localStorage.setItem(email + "_failedAttempts", failedAttempts);

    document.getElementById("msg").innerText =
      "Login failed ❌ (" + failedAttempts + ")";
  }
};
