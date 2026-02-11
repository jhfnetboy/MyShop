import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-flash-latest')

def generate_community_report(event_title, feedbacks):
    """
    feedbacks: list of dicts {transcription, sentiment, keywords}
    """
    if not feedbacks:
        return "No feedback data available for this event."

    # Prepare data for AI
    combined_text = "\n---\n".join([f"Feedback: {f['transcription']}\nKeywords: {f['keywords']}" for f in feedbacks])
    
    prompt = f"""
    You are the EchoRank Community Summarizer.
    Event: {event_title}
    
    Background Feedbacks:
    {combined_text[:10000]} # Limit tokens
    
    Tasks:
    1. Summarize the collective community sentiment in 3-4 sentences.
    2. Identify the top 5 most mentioned keywords or themes for a "Word Cloud".
    3. Provide an overall Community Score (0-100).
    
    Output JSON ONLY:
    {{
        "sentiment_report": "string",
        "word_cloud": ["keyword1", "keyword2", ...],
        "community_score": number
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"Summarizer Error: {e}")
        return None

# Simple test case
if __name__ == "__main__":
    test_title = "ETH Chiang Mai Workshop"
    test_feedbacks = [
        {"transcription": "Amazing speaker, learned a lot about ZK.", "keywords": ["ZK", "speaker"]},
        {"transcription": "The venue was a bit crowded but the food was great.", "keywords": ["crowded", "food"]}
    ]
    print(json.dumps(generate_community_report(test_title, test_feedbacks), indent=2))
