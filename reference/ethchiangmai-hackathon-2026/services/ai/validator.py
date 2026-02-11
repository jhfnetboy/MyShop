import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

model = genai.GenerativeModel('gemini-flash-latest')

def validate_event_content(text_content):
    """
    Analyzes text content to extract metadata and validate against criteria.
    Criteria: 1. Chiang Mai Local, 2. Web3/Crypto, 3. Co-creation/Academic.
    Matches required: 2/3.
    """
    
    prompt = f"""
    You are an Event Validator Agent for EchoRank.
    Rules:
    1. Extract the following metadata: Title, Location, Start Time.
    2. Summarize the event in LESS THAN 30 WORDS (Strict limit).
    3. Validate against these 3 tags:
       - "local": Is it physically in Chiang Mai?
       - "web3": Is it related to Crypto/Blockchain/ETH?
       - "co_creation": Is it a workshop, talk, or academic event (NOT just a party)?
    
    Input Text:
    {text_content[:3000]}  # Limit input size
    
    Output JSON format ONLY:
    {{
        "metadata": {{
            "title": "string",
            "location": "string",
            "time": "string or null"
        }},
        "summary": "string (< 30 words)",
        "tags": {{
            "local": boolean,
            "web3": boolean,
            "co_creation": boolean
        }},
        "valid": boolean  # True if at least 2 tags are true
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        # Cleanup json block if present
        text = response.text.replace('```json', '').replace('```', '').strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"AI Error: {e}")
        return None

# Test
if __name__ == "__main__":
    sample_text = "Join us at The Box, Chiang Mai for an Ethereum developer workshop on Zero Knowledge Proofs. starting at 10 AM tomorrow."
    print(json.dumps(validate_event_content(sample_text), indent=2))
