"""Validated server deployment environment configuration."""
import os
from enum import Enum


class Env(str, Enum):
    development = "development"
    staging = "staging"
    production = "production"


# Deliberately validate at import time. An unrecognised deployment setting must not
# silently fall back to production behaviour.
ENVIRONMENT = Env(os.environ.get("ENVIRONMENT", Env.production.value))
IS_QA_ENABLED = ENVIRONMENT in (Env.development, Env.staging)
