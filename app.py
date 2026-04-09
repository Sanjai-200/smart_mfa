from flask import Flask, request, jsonify, render_template
import pickle
import pandas as pd
from datetime import datetime
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

# ================= CONFIG =================
EMAIL_SENDER = "smart7mfa@gmail.com"
EMAIL_PASSWORD = "rnokxuzddimxpgob"  # ⚠️ keep no spaces

# ================= LOAD MODEL =================
try:
    with open("model.pkl", "rb") as f:
        model = pickle.load(f)
    print("✅ ML model loaded")
except Exception as e:
    print("❌ Model load error:", e)
    model = None


# ================= EMAIL FUNCTION =================
def send_email(to_email, otp):
    if not to_email or not otp:
        print("❌ Invalid email/otp")
        return False

    msg = MIMEText(f"Your OTP is: {otp}")
    msg["Subject"] = "Smart MFA - OTP Verification"
    msg["From"] = EMAIL_SENDER
    msg["To"] = to_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
        server.quit()

        print(f"✅ OTP sent to {to_email}")
        return True

    except Exception as e:
        print("❌ Email error:", e)
        return False


# ================= ROUTES =================
@app.route("/")
def login():
    return render_template("index.html")


@app.route("/signup")
def signup():
    return render_template("signup.html")


@app.route("/otp")
def otp():
    return render_template("otp.html")


@app.route("/home")
def home():
    return render_template("home.html")


# ================= OTP ROUTE =================
@app.route("/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json() or {}

    email = data.get("email")
    otp = data.get("otp")

    if not email or not otp:
        return jsonify({"status": "error"}), 400

    success = send_email(email, otp)

    return jsonify({"status": "sent" if success else "failed"})


# ================= HELPERS =================
def safe_int(value, default=0):
    try:
        return int(value)
    except:
        return default


def parse_time(time_str):
    if not time_str:
        return 12

    try:
        time_str = str(time_str)

        # 24-hour format
        if ":" in time_str and "AM" not in time_str and "PM" not in time_str:
            return int(time_str.split(":")[0])

        # 12-hour format
        if "AM" in time_str or "PM" in time_str:
            try:
                return datetime.strptime(time_str, "%I:%M:%S %p").hour
            except:
                return datetime.strptime(time_str, "%I:%M %p").hour

    except:
        pass

    return 12


def parse_location(location):
    if not location:
        return 0

    loc = str(location).strip().lower()

    # safe locations
    if loc in ["india", "unknown", ""]:
        return 0

    return 1


def parse_device(device):
    if not device:
        return 0

    return 1 if "mobile" in str(device).lower() else 0


# ================= ENCODE =================
def encode(data):
    return pd.DataFrame(
        [[
            parse_device(data.get("device")),
            parse_location(data.get("location")),
            safe_int(data.get("loginCount"), 1),
            parse_time(data.get("time")),
            safe_int(data.get("failedAttempts"), 0)
        ]],
        columns=["device", "location", "loginCount", "hour", "failedAttempts"]
    )


# ================= PREDICT =================
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json() or {}

    try:
        input_data = encode(data)

        if model is None:
            raise Exception("Model not loaded")

        pred = int(model.predict(input_data)[0])

    except Exception as e:
        print("❌ ML Error:", e)
        pred = 0  # fallback SAFE

    print("📊 Input:", data)
    print("🔮 Prediction:", pred)

    return jsonify({"prediction": pred})


# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
