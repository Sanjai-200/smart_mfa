from flask import Flask, request, jsonify, render_template
import pickle
import pandas as pd
from datetime import datetime
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

# ================= EMAIL CONFIG =================
EMAIL_SENDER   = "smart7mfa@gmail.com"
EMAIL_PASSWORD = "qbfq ujgg pnpo ikrc"   # Gmail App Password (no spaces needed but works either way)

# LOAD MODEL
with open("model.pkl", "rb") as f:
    model = pickle.load(f)


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


# ================= EMAIL =================
def send_email(receiver, otp):
    if not receiver or not otp:
        print("❌ Email Error: Missing receiver or OTP")
        return False

    try:
        msg             = MIMEText(f"Your Smart MFA OTP is: {otp}\n\nThis OTP is valid for 5 minutes.\nDo not share it with anyone.")
        msg["Subject"]  = "Your Smart MFA OTP Code"
        msg["From"]     = EMAIL_SENDER
        msg["To"]       = receiver

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()

        print(f"✅ OTP Email sent to {receiver}")
        return True

    except smtplib.SMTPAuthenticationError:
        print("❌ Email Error: Authentication failed. Check Gmail App Password.")
        return False
    except smtplib.SMTPException as e:
        print("❌ SMTP Error:", e)
        return False
    except Exception as e:
        print("❌ Email Error:", e)
        return False


@app.route("/send-otp", methods=["POST"])
def send_otp():
    data    = request.json
    email   = data.get("email")
    otp     = data.get("otp")
    success = send_email(email, otp)
    return jsonify({"status": "sent" if success else "failed"})


# ================= PARSERS =================
def safe_int(value, default=0):
    try:
        return int(value)
    except:
        return default


def parse_time(time_str):
    try:
        return int(str(time_str).split(":")[0])
    except:
        return 12


def parse_location(location):
    """0 = India/Unknown (safe), 1 = Foreign country (risky)"""
    if not location:
        return 0
    loc = str(location).strip().lower()
    if loc in ["india", "unknown", ""]:
        return 0
    return 1


def parse_device(device):
    """1 = Mobile, 0 = Laptop/Desktop"""
    if not device:
        return 0
    dev = str(device).strip().lower()
    if "mobile" in dev:
        return 1
    return 0


# ================= ENCODE =================
def encode(data):
    device         = parse_device(data.get("device"))
    location       = parse_location(data.get("location"))
    loginCount     = safe_int(data.get("loginCount"),     1)
    failedAttempts = safe_int(data.get("failedAttempts"), 0)
    hour           = parse_time(data.get("time"))

    df = pd.DataFrame(
        [[device, location, loginCount, hour, failedAttempts]],
        columns=["device", "location", "loginCount", "hour", "failedAttempts"]
    )

    print("FINAL INPUT TO MODEL:", df.values.tolist())
    return df


# ================= PREDICT =================
@app.route("/predict", methods=["POST"])
def predict():
    data       = request.json
    print("RECEIVED:", data)

    input_data = encode(data)
    pred       = model.predict(input_data)[0]

    print("PREDICTION:", pred, "(0=safe, 1=risky)")
    return jsonify({"prediction": int(pred)})


# RUN
if __name__ == "__main__":
    app.run(debug=True)
