import datetime
import re

from app.db_operations import push_notifications

CPU_THRESHOLD = 85.0
LOW_MEM_FRACTION = 0.10
PACKET_LOSS_THRESHOLD = 15.0
ROUTER_OFFLINE_SECONDS = 30
# Placeholder — set to real per-interface link capacity before enabling spikes.
TRAFFIC_SPIKE_CEILING_BPS = 0

CPU_DEBOUNCE = 3
MEM_DEBOUNCE = 3
IFACE_DOWN_DEBOUNCE = 3
TRAFFIC_SPIKE_DEBOUNCE = 2

COOLDOWN = datetime.timedelta(minutes=15)

_UPTIME_UNITS = {"w": 604800, "d": 86400, "h": 3600, "m": 60, "s": 1}


def _uptime_to_seconds(uptime: str) -> int:
    total = 0
    for value, unit in re.findall(r"(\d+)([wdhms])", uptime or ""):
        total += int(value) * _UPTIME_UNITS[unit]
    return total


def _default_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class Alerter:
    def __init__(self, send=push_notifications.send_admin_alert, now=_default_now):
        self._send = send
        self._now = now
        self._streak: dict[str, int] = {}
        self._last_fired: dict[str, datetime.datetime] = {}
        self._prev_uptime_secs: int | None = None

    def _debounced(self, key: str, condition: bool, needed: int) -> bool:
        self._streak[key] = self._streak.get(key, 0) + 1 if condition else 0
        return self._streak[key] >= needed

    def _fire(self, key: str, title: str, body: str) -> None:
        now = self._now()
        last = self._last_fired.get(key)
        if last is not None and now - last < COOLDOWN:
            return
        self._send(title, body)
        self._last_fired[key] = now

    def evaluate_router_health(self, cpu_load, free_memory, total_memory, uptime):
        if self._debounced("cpu", cpu_load > CPU_THRESHOLD, CPU_DEBOUNCE):
            self._fire("cpu", "High CPU", f"Router CPU at {cpu_load:.0f}%")

        free_fraction = free_memory / total_memory if total_memory else 1.0
        if self._debounced("mem", free_fraction < LOW_MEM_FRACTION, MEM_DEBOUNCE):
            self._fire("mem", "Low memory", f"Only {free_fraction * 100:.0f}% RAM free")

        current = _uptime_to_seconds(uptime)
        if self._prev_uptime_secs is not None and current < self._prev_uptime_secs:
            self._fire("reboot", "Router rebooted", f"Uptime reset to {uptime}")
        self._prev_uptime_secs = current

    def evaluate_traffic(self, interface, rx_bps, tx_bps):
        down_key = f"iface_down:{interface}"
        if self._debounced(down_key, rx_bps == 0 and tx_bps == 0, IFACE_DOWN_DEBOUNCE):
            self._fire(down_key, "Interface down", f"{interface} has no traffic")

        spike_key = f"spike:{interface}"
        over = TRAFFIC_SPIKE_CEILING_BPS > 0 and (
            rx_bps > TRAFFIC_SPIKE_CEILING_BPS or tx_bps > TRAFFIC_SPIKE_CEILING_BPS
        )
        if self._debounced(spike_key, over, TRAFFIC_SPIKE_DEBOUNCE):
            self._fire(spike_key, "Traffic spike", f"{interface} traffic exceeds ceiling")

    def evaluate_packet_loss(self, loss_percent):
        if loss_percent > PACKET_LOSS_THRESHOLD:
            self._fire("loss", "High packet loss", f"Packet loss at {loss_percent:.0f}%")

    def evaluate_router_offline(self, seconds_since_last_row):
        if seconds_since_last_row > ROUTER_OFFLINE_SECONDS:
            self._fire(
                "offline",
                "Router offline",
                f"No metrics for {seconds_since_last_row:.0f}s",
            )


alerter = Alerter()
