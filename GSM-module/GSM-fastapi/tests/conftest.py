import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "sqlite:///./test-gsm.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
