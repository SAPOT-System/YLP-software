#!/bin/sh
set -eu

# Prints this machine's primary outbound LAN IP (the address other devices
# on the network would use to reach it). Used by up.sh to extend CERT_SAN
# so the dev TLS cert (gen-certs.sh) validates when a client connects via
# LAN IP instead of localhost.
#
# Uses a UDP "connect" (no packets actually sent) so it works without root
# and picks the correct interface on multi-homed machines regardless of
# which one owns the default route. python3 is already a hard dependency
# of this project, so no extra tooling is required.

python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(('1.1.1.1', 80))
    print(s.getsockname()[0])
finally:
    s.close()
"
