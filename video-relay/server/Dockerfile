FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# cookies.tx[t] copies cookies.txt only if you've added one
COPY main.py index.html watermark.png cookies.tx[t] ./
ENV PORT=8080
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
