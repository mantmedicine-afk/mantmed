"""IP reale del client dietro i proxy della piattaforma (Cloudflare + bilanciatore Google).

X-Forwarded-For è "client, proxy1, proxy2": i valori a sinistra possono essere falsificati dal client,
quindi si legge da destra saltando i salti di rete fidati (reti private, Cloudflare, bilanciatori Google)."""
import ipaddress
from fastapi import Request

_TRUSTED = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10", "::1/128", "fc00::/7", "fe80::/10",
    # Cloudflare
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
    # Google Cloud load balancer / health checks
    "35.191.0.0/16", "130.211.0.0/22", "35.244.0.0/16", "34.96.0.0/20",
)]


def _trusted(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return any(a in n for n in _TRUSTED if n.version == a.version)


def client_ip(request: Request) -> str:
    hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    hops.append(request.client.host if request.client else "")
    for h in reversed(hops):
        if h and not _trusted(h):
            return h[:64]
    return (hops[0] if hops else "")[:64]
