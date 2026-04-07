
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAJ1tXTtgdNa96kBtVhTVkE-GJTU6PqAHs",
  authDomain: "smart-mfa-1f502.firebaseapp.com",
  projectId: "smart-mfa-1f502",
  storageBucket: "smart-mfa-1f502.firebasestorage.app",
  messagingSenderId: "30569347828",
  appId: "1:30569347828:web:2b1ba93e9e825bd5cfbca1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
