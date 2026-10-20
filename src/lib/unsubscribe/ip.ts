import net from "node:net";

const blocked = new net.BlockList();

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");

blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("fec0::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");

/** Reject private/reserved IPs, including expanded and IPv4-mapped IPv6. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (!family) return true;
  // BlockList also matches IPv4 rules against IPv4-mapped IPv6 addresses.
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}
