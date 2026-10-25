FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
# O .lock fixa as versões testadas (reprodutível); atualize com pip-audit quando houver correções.
COPY backend/requirements.txt backend/requirements.lock backend/
RUN pip install --no-cache-dir -r backend/requirements.txt -c backend/requirements.lock
COPY backend backend
COPY assets assets
COPY index.html lab-config.js ./
RUN useradd --create-home hub && mkdir -p /data/files && chown -R hub:hub /data /app
USER hub
EXPOSE 5000
CMD ["python", "-m", "backend.app"]
