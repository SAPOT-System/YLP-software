#!/usr/bin/env python3
# sim_tcp_client.py <host> <port> <num_clients> <duration_sec>
# Simulates N TCP clients connecting to the Android app's TCP server.
import socket, threading, time, sys, json, statistics

results = []
lock = threading.Lock()  # protects shared results list across threads

def run_client(cid, host, port, duration, interval=0.5):
    rtts, drops = [], 0
    try:
        # open one persistent TCP connection per simulated client
        sock = socket.create_connection((host, port), timeout=5)
    except Exception as e:
        print(f"[client {cid}] connect failed: {e}")
        return
    t_end = time.time() + duration
    while time.time() < t_end:
        # embed a timestamp in the payload so the server can echo it back
        msg = json.dumps({"id": cid, "seq": len(rtts), "ts": time.time()}).encode() + b"\n"
        try:
            t0 = time.time()
            sock.sendall(msg)
            sock.recv(1024)                          # wait for echo reply
            rtts.append((time.time() - t0) * 1000)  # RTT in milliseconds
        except Exception:
            drops += 1  # count failed sends/receives as drops
        time.sleep(interval)  # 500 ms between messages → 120 msgs per 60 s run
    sock.close()
    with lock:
        results.append({"client": cid, "rtts": rtts, "drops": drops})

host, port = sys.argv[1], int(sys.argv[2])
n, dur = int(sys.argv[3]), int(sys.argv[4])
# launch all N client threads concurrently — they start at roughly the same time
threads = [threading.Thread(target=run_client, args=(i, host, port, dur)) for i in range(n)]
for t in threads: t.start()
for t in threads: t.join()

# flatten per-client RTT lists into one list for aggregate statistics
all_rtts = [r for c in results for r in c["rtts"]]
total_drops = sum(c["drops"] for c in results)
print(f"Clients: {n}  Messages: {len(all_rtts)}  Drops: {total_drops}")
if all_rtts:
    print(f"Avg RTT: {statistics.mean(all_rtts):.2f} ms  Max: {max(all_rtts):.2f} ms")
    print(f"Jitter (stdev): {statistics.stdev(all_rtts) if len(all_rtts)>1 else 0:.2f} ms"
          f"  Success: {100*(1 - total_drops/(len(all_rtts)+total_drops)):.1f}%")
