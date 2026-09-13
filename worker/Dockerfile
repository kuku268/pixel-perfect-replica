# Worker image — worker.py + the whisper / assemblyai / align modules, with
# ffmpeg baked in. Built by AWS CodeBuild (see /buildspec.yml) on x86_64,
# pushed to ECR, run one container per job on ECS Fargate.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py transcribe_whisper.py transcribe_assemblyai.py align.py ./

# ffmpeg/ffprobe decode user-supplied files (local uploads from Step 3). Run as
# an unprivileged user so a decoder bug cannot touch anything outside /app and
# /tmp; the container is single-use and destroyed after the job anyway.
RUN useradd --create-home --uid 10001 worker
USER worker

# JOB_ID + SUPABASE_URL + SUPABASE_SECRET_KEY + OPENAI_API_KEY arrive as env
# from the Lambda distributor's RunTask containerOverrides. PRO_TIER_ENABLED,
# AUDIO_BUCKET, PRO_CREDITS_PER_MINUTE come from the task definition.
CMD ["python", "worker.py"]
