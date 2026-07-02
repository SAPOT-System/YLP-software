from routeros_api import RouterOsApiPool

ROUTER_CONFIG = {
    "host": "192.168.0.1",
    "username": "admin",
    "password": "sapot"
}

class MikroTikClient:
    def __init__(self, host, username, password):
        self.pool = RouterOsApiPool(
            host=host,
            username=username,
            password=password,
            plaintext_login=True
        )
        self.api = self.pool.get_api()

    def system_resource(self):
        return self.api.get_resource("/system/resource").get()[0]

    def traffic(self, interface: str):
        iface = self.api.get_resource("/interface")
        return iface.call(
            "monitor-traffic",
            {"interface": interface, "once": ""}
        )[0]

    def close(self):
        self.pool.disconnect()
