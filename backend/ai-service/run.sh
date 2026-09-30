#!/bin/bash
cd /mnt/data/CROTALUS_INVEST/aetherion/backend/ai-service
source venv/bin/activate
export PYTHONUNBUFFERED=1
uvicorn main:app --host 0.0.0.0 --port 8100 --log-level info
