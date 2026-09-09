# M4 worker image — the same worker.py M1 runs on the EC2, with ffmpeg baked in.
# Built by AWS CodeBuild (see /buildspec.yml) on x86_64, pushed to ECR, run one
# container per job on ECS Fargate. Never built on the EC2 or a laptop.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py .

# JOB_ID + SUPABASE_URL + SUPABASE_SECRET_KEY + OPENAI_API_KEY arrive as env
# from the Lambda distributor's RunTask containerOverrides.
CMD ["python", "worker.py"]
