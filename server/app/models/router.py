from sqlmodel import SQLModel, Field
from typing import Optional
import datetime


class RouterHealth(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)

    cpu_load: float
    free_memory: int
    total_memory: int
    uptime: str

    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class InterfaceTraffic(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)

    interface: str

    rx_bps: int
    tx_bps: int

    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
