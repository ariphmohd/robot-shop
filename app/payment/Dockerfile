FROM python:3.9-slim-bookworm

EXPOSE 8080
ENV INSTANA_SERVICE_NAME=payment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /app/

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=1:1 *.py ./
COPY --chown=1:1 payment.ini ./

USER 1:1
CMD ["uwsgi", "--ini", "payment.ini"]

