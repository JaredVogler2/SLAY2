#!/usr/bin/env bash
# ADR-036 stage 2 (confirm): the four candidates that advanced, 1,000 fresh dev seeds each (dev[2000:3000]), paired with the base
cd /home/user/SLAY2
PYTHONPATH=sim nice -n 8 /home/user/venvs/sts2/bin/python -m slay2_sim tune --policy rules_v2 \
  --base '{"threshold":0.0,"values":"experiments/cardvalue/ironclad-a0-v1.json"}' \
  --candidates experiments/tuning/rules_v2-ironclad-a0-v1/stage2-candidates.json \
  --seeds experiments/seeds/ironclad-a0-v2.json --partition dev --offset 2000 --n 1000 --workers 3 --out experiments/tuning/rules_v2-ironclad-a0-v1/stage2 > scratch/tune-stage2.log 2>&1
echo "STAGE2_EXIT=$?" >> scratch/tune-stage2.log
