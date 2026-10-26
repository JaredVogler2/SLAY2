#!/usr/bin/env bash
cd /home/user/SLAY2
PYTHONPATH=sim /home/user/venvs/sts2/bin/python -m slay2_sim tune --policy rules_v2 \
  --base '{"threshold":0.0,"values":"experiments/cardvalue/ironclad-a0-v1.json"}' \
  --one-at-a-time "elite_ok_hp=0.6,0.7,0.9;elite_value=0.5,1,3,4;elite_ok_floor=0,2,8;elite_mid_value=-1,1;heal_below=0.5,0.6,0.8;boss_heal_below=0.7,1.0;rest_weight=1.5,5;shop_rich=0,2.5;treasure_value=1,3;unknown_value=0.2,1.5;shop_card_threshold=2.8,4.4;shop_potion_margin=0,100;potion_hp_frac=0.08,0.3;danger_frac=0.2,0.45;max_deck=26,40;monster_hp_penalty=0,1.5" \
  --candidates experiments/tuning/rules_v2-ironclad-a0-v1/threshold.json \
  --seeds experiments/seeds/ironclad-a0-v2.json --partition dev --offset 1000 --n 500 --workers 4 --out experiments/tuning/rules_v2-ironclad-a0-v1/stage1 > scratch/tune-stage1.log 2>&1
echo "STAGE1_EXIT=$?" >> scratch/tune-stage1.log
