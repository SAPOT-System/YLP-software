import time

from sqlmodel import Session
from app.db_operations.router_client import MikroTikClient
from app.models import RouterHealth, InterfaceTraffic
from app.db_operations.auth import engine
from app.db_operations.alerting import alerter

ROUTER_CONFIG = {
    "host": "192.168.0.1",
    "username": "admin",
    "password": "sapot"
}

# Timestamp of the last successful metrics commit. collect_metrics() runs its
# own internal `while True` and only exits by raising, so collect_metrics_loop()
# cannot rely on a normal return to know when a cycle succeeded — it reads this
# instead.
_last_success_time = time.time()


def collect_metrics():
    client = MikroTikClient(**ROUTER_CONFIG)

    interfaces = ['ether1', 'ether2',  'ether3',  'ether4',  'ether5']  

    try:
        while True:
            with Session(engine) as session:

                # ---- SYSTEM ----
                sys = client.system_resource()
                cpu_load = float(sys["cpu-load"])
                free_memory = int(sys["free-memory"])
                total_memory = int(sys["total-memory"])
                uptime = sys["uptime"]

                session.add(
                    RouterHealth(
                        cpu_load=cpu_load,
                        free_memory=free_memory,
                        total_memory=total_memory,
                        uptime=uptime,
                    )
                )

                # ---- TRAFFIC ----
                traffic_samples = []
                for iface in interfaces:
                    t = client.traffic(iface)
                    rx_bps = int(t["rx-bits-per-second"])
                    tx_bps = int(t["tx-bits-per-second"])
                    traffic_samples.append((iface, rx_bps, tx_bps))

                    session.add(
                        InterfaceTraffic(
                            interface=iface,
                            rx_bps=rx_bps,
                            tx_bps=tx_bps,
                        )
                    )

                session.commit()

            global _last_success_time
            _last_success_time = time.time()

            # Evaluate AFTER a successful commit; never let alerting break collection.
            try:
                alerter.evaluate_router_health(
                    cpu_load=cpu_load,
                    free_memory=free_memory,
                    total_memory=total_memory,
                    uptime=uptime,
                )
                for iface, rx_bps, tx_bps in traffic_samples:
                    alerter.evaluate_traffic(iface, rx_bps, tx_bps)
            except Exception:
                pass

            time.sleep(5)

    finally:
        client.close()


def collect_metrics_loop():
    backoff = 2  # start retry delay

    while True:
        try:
            # 👇 your actual collector function (loops internally; only
            # returns by raising, so success is tracked via
            # _last_success_time rather than a normal return here)
            collect_metrics()

            # reset backoff (unreachable in practice, kept for safety)
            backoff = 2

            # normal polling interval
            time.sleep(3)

        except Exception as e:
            # logger.error(f"MikroTik collector error: {e}")
            try:
                alerter.evaluate_router_offline(time.time() - _last_success_time)
            except Exception:
                pass

            # exponential backoff (max 60s)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
