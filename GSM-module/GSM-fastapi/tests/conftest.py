import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "sqlite:///./test-gsm.db")
os.environ.setdefault("GSM_SECRET", "test-gsm-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
