import datetime

from app.db_operations.alerting import Alerter, COOLDOWN


class Clock:
    def __init__(self):
        self.t = datetime.datetime(2026, 7, 14, 12, 0, 0, tzinfo=datetime.timezone.utc)

    def now(self):
        return self.t

    def advance(self, **kw):
        self.t += datetime.timedelta(**kw)


def make(sent):
    clock = Clock()
    return Alerter(send=lambda title, body: sent.append((title, body)), now=clock.now), clock


def test_high_cpu_fires_only_after_three_consecutive_samples():
    sent = []
    a, _ = make(sent)
    a.evaluate_router_health(90, 50, 100, "1h")   # 1
    a.evaluate_router_health(90, 50, 100, "1h")   # 2
    assert sent == []
    a.evaluate_router_health(90, 50, 100, "1h")   # 3 -> fire
    assert len(sent) == 1 and sent[0][0].startswith("High CPU")


def test_cpu_streak_resets_when_condition_clears():
    sent = []
    a, _ = make(sent)
    a.evaluate_router_health(90, 50, 100, "1h")
    a.evaluate_router_health(10, 50, 100, "1h")   # clears streak
    a.evaluate_router_health(90, 50, 100, "1h")
    a.evaluate_router_health(90, 50, 100, "1h")
    assert sent == []


def test_cooldown_blocks_refire_within_window_then_allows_after():
    sent = []
    a, clock = make(sent)
    for _ in range(3):
        a.evaluate_router_health(90, 50, 100, "1h")
    assert len(sent) == 1
    for _ in range(3):
        a.evaluate_router_health(90, 50, 100, "1h")  # still in cooldown
    assert len(sent) == 1
    clock.advance(seconds=COOLDOWN.total_seconds() + 1)
    for _ in range(3):
        a.evaluate_router_health(90, 50, 100, "1h")
    assert len(sent) == 2


def test_low_memory_fires_after_three_samples():
    sent = []
    a, _ = make(sent)
    for _ in range(3):
        a.evaluate_router_health(10, 5, 100, "1h")   # 5% free < 10%
    assert len(sent) == 1 and sent[0][0].startswith("Low memory")


def test_router_reboot_fires_when_uptime_drops():
    sent = []
    a, _ = make(sent)
    a.evaluate_router_health(10, 50, 100, "5h")   # establishes baseline, no fire
    a.evaluate_router_health(10, 50, 100, "1m")   # uptime dropped -> reboot
    assert any(t.startswith("Router rebooted") for t, _ in sent)


def test_interface_down_is_per_interface():
    sent = []
    a, _ = make(sent)
    for _ in range(3):
        a.evaluate_traffic("ether1", 0, 0)
    for _ in range(2):
        a.evaluate_traffic("ether2", 0, 0)   # only 2 samples -> no fire
    assert len(sent) == 1 and "ether1" in sent[0][1]


def test_packet_loss_fires_above_threshold_no_debounce():
    sent = []
    a, _ = make(sent)
    a.evaluate_packet_loss(20.0)
    assert len(sent) == 1 and sent[0][0].startswith("High packet loss")


def test_router_offline_fires_once_past_threshold():
    sent = []
    a, _ = make(sent)
    a.evaluate_router_offline(10)   # under 30s
    assert sent == []
    a.evaluate_router_offline(45)   # over 30s
    assert len(sent) == 1 and sent[0][0].startswith("Router offline")
