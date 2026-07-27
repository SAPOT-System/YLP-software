# Windows/PowerShell equivalent of detect-ip.sh — prints this machine's
# primary outbound LAN IP (the address other devices on the network would
# use to reach it), for feeding into CERT_SAN via up.ps1. Uses a UDP
# "connect" (no packets actually sent) so it needs no elevated privileges
# and picks the correct interface on multi-homed machines. Keep in sync
# with detect-ip.sh if you change the detection logic.

$ErrorActionPreference = "Stop"

$socket = New-Object System.Net.Sockets.Socket(
    [System.Net.Sockets.AddressFamily]::InterNetwork,
    [System.Net.Sockets.SocketType]::Dgram,
    [System.Net.Sockets.ProtocolType]::Udp)
try {
    $socket.Connect("1.1.1.1", 80)
    $localEndPoint = [System.Net.IPEndPoint]$socket.LocalEndPoint
    Write-Output $localEndPoint.Address.ToString()
} finally {
    $socket.Close()
}
