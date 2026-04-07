from flask import Flask, request, jsonify, render_template
import pickle
import pandas as pd
from datetime import datetime
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

# LOAD MODEL
with open("model.pkl", "rb") as f:
    model = pickle.load(f)

# ================= EMAIL FUNCTION =================
def send_email(to_email, otp):
    sender = "smart7mfa@gmail.com"
    password = "xmsfegbbvfiywbo"   # no spaces

    print("\n================ OTP DEBUG ================")
    print("📨 Sending OTP to:", to_email)
    print("🔐 OTP:", otp)
    print("==========================================\n")

    msg = MIMEText(f"Your OTP is: {otp}")
    msg["Subject"] = "OTP Verification"
    msg["From"] = sender
    msg["To"] = to_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.ehlo()
        server.starttls()
        server.ehlo()

        server.login(sender, password)
        server.sendmail(sender, to_email, msg.as_string())

        server.quit()
        print("✅ Email sent successfully")

    except Exception as e:
        print("❌ Email error:", e)

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
    data = request.json
    email = data.get("email")
    otp = data.get("otp")

    send_email(email, otp)

    return jsonify({"status": "sent"})

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
        if ":" in time_str and "AM" not in time_str and "PM" not in time_str:
            return int(time_str.split(":")[0])

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
    return 0 if loc in ["india", "unknown", ""] else 1

def parse_device(device):
    if not device:
        return 0

    return 1 if "mobile" in str(device).lower() else 0

# ================= ENCODE =================
def encode(data):
    device = parse_device(data.get("device"))
    location = parse_location(data.get("location"))
    loginCount = safe_int(data.get("loginCount"), 1)
    failedAttempts = safe_int(data.get("failedAttempts"), 0)
    hour = parse_time(data.get("time"))

    df = pd.DataFrame(
        [[device, location, loginCount, hour, failedAttempts]],
        columns=["device", "location", "loginCount", "hour", "failedAttempts"]
    )

    return df

# ================= PREDICT =================
@app.route("/predict", methods=["POST"])
def predict():
    data = request.json

    input_data = encode(data)
    pred = model.predict(input_data)[0]

    print("RAW INPUT:", data)
    print("PREDICTION:", pred)

    return jsonify({"prediction": int(pred)})

# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
