from flask import Flask, request, jsonify
from transformers import pipeline
import re

app = Flask(__name__)

# 🚫 List of banned words (modify as needed)
BANNED_WORDS = {"example_racist_term", "example_casteist_term"}

def contains_banned_words(text):
    """Check if the text contains any banned words."""
    return any(re.search(rf"\b{word}\b", text, re.IGNORECASE) for word in BANNED_WORDS)

# 🔄 Load AI model once at startup
print("🔄 Loading AI Moderation Model...")
try:
    toxicity_model = pipeline("text-classification", model="facebook/roberta-hate-speech-dynabench-r4-target")
    print("✅ AI Model Loaded!")
except Exception as e:
    print(f"❌ Model Load Error: {e}")
    toxicity_model = None

def moderate_with_ai(title, content, model, threshold=0.7):
    """Use AI to detect hate speech in the combined title + content."""
    if model is None:
        return {"allowed": False, "reason": "AI moderation unavailable (Model failed to load)"}

    try:
        message = f"{title} {content}"
        print("🔍 AI analyzing:", message)

        prediction = model(message)[0]
        print("🔍 AI Response:", prediction)

        is_hateful = prediction["label"] == "hate" and prediction["score"] >= threshold
        return {
            "allowed": not is_hateful,
            "reason": "Content violates community guidelines." if is_hateful else "Allowed"
        }

    except Exception as e:
        print("❌ AI Moderation Error:", e)
        return {"allowed": False, "reason": "AI moderation failed (Error)"}

@app.route("/moderate", methods=["POST"])
def moderate():
    data = request.get_json()
    title, content = data.get("title", "").strip(), data.get("content", "").strip()

    if not title or not content:
        return jsonify({"allowed": False, "reason": "Title and content are required."}), 400

    # 🚫 Check for banned words
    if contains_banned_words(title) or contains_banned_words(content):
        return jsonify({"allowed": False, "reason": "Contains banned words."})

    # 🔍 AI Moderation
    ai_result = moderate_with_ai(title, content, toxicity_model)

    return jsonify(ai_result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)
