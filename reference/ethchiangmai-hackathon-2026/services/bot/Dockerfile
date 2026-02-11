# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    &> /dev/null && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Set environment variables for the bot to find the AI service in Docker network
ENV AI_SERVICE_URL=http://ai-service:8001
ENV DB_HOST=db

# Command to run the application
CMD ["python", "bot.py"]
