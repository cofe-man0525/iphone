import json,sys
from seed_adapter import SeedVCAdapter
model=SeedVCAdapter();model.load();print(json.dumps(model.status(),ensure_ascii=False,indent=2))
sys.exit(0 if model.ready else 1)
