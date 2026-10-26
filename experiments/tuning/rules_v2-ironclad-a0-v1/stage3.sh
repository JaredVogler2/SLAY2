#!/usr/bin/env bash
# ADR-036 stage 3 (combine): the three confirmed changes at once, 1,000 fresh dev seeds (dev[3000:4000]), paired with the base
cd /home/user/SLAY2
PYTHONPATH=sim nice -n 8 /home/user/venvs/sts2/bin/python -m slay2_sim tune --policy rules_v2 \
  --base '{"threshold":0.0,"values":"experiments/cardvalue/ironclad-a0-v1.json"}' \
  --candidates experiments/tuning/rules_v2-ironclad-a0-v1/stage3-candidates.json \
  --seeds experiments/seeds/ironclad-a0-v2.json --partition dev --offset 3000 --n 1000 --workers 3 --out experiments/tuning/rules_v2-ironclad-a0-v1/stage3 > scratch/tune-stage3.log 2>&1
echo "STAGE3_EXIT=$?" >> scratch/tune-stage3.log
