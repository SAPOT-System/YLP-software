import time

from sqlmodel import Session
from app.db_operations.router_client import MikroTikClient
from app.models import RouterHealth, InterfaceTraffic
from app.db_operations.auth import engine

ROUTER_CONFIG = {
    "host": "192.168.0.1",
    "username": "admin",
    "password": "sapot"
}


def collect_metrics():
    client = MikroTikClient(**ROUTER_CONFIG)

    interfaces = ['ether1', 'ether2',  'ether3',  'ether4',  'ether5']  

    try:
        while True:
            with Session(engine) as session:

                # ---- SYSTEM ----
                sys = client.system_resource()

                session.add(
                    RouterHealth(
                        cpu_load=float(sys["cpu-load"]),
                        free_memory=int(sys["free-memory"]),
                        total_memory=int(sys["total-memory"]),
                        uptime=sys["uptime"],
                    )
                )

                # ---- TRAFFIC ----
                for iface in interfaces:
                    t = client.traffic(iface)

                    session.add(
                        InterfaceTraffic(
                            interface=iface,
                            rx_bps=int(t["rx-bits-per-second"]),
                            tx_bps=int(t["tx-bits-per-second"]),
                        )
                    )

                session.commit()

            time.sleep(5)

    finally:
        client.close()
