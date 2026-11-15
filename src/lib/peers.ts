import type { AgentNetwork } from "@/lib/runtime";

export type AgentManifest = {
  networks: { name: string; front_man: string; hocon: string; description?: string }[];
};

export async function resolvePublishedPeer(
  ref: string,
  links: Record<string, string>,
  callerOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ network: AgentNetwork; frontMan: string; origin: string }> {
  const raw = ref.includes("://") ? ref : new URL(links[ref] ?? ref, callerOrigin).toString();
  const url = new URL(raw);
  const networkName = url.pathname.split("/").filter(Boolean).pop();
  if (!networkName) throw new Error("That peer URL does not name a network.");
  const basePath = url.pathname.replace(/\/[^/]+$/, "");
  const manifestUrl = `${url.origin}${basePath}/agent-manifest.json`;
  const manifestResponse = await fetchImpl(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Could not read the manifest at ${manifestUrl}.`);
  }
  const manifest = (await manifestResponse.json()) as AgentManifest;
  const entry = manifest.networks?.find((item) => item.name === networkName);
  if (!entry) {
    throw new Error(`No published network named ${networkName}.`);
  }
  const definitionUrl = new URL(entry.hocon, manifestUrl);
  if (definitionUrl.origin !== url.origin) {
    throw new Error(`The network file stays on ${url.origin}; refusing ${definitionUrl.origin}.`);
  }
  const definitionResponse = await fetchImpl(definitionUrl.toString());
  if (!definitionResponse.ok) throw new Error("Could not read the peer network definition.");
  const network = (await definitionResponse.json()) as AgentNetwork;
  return { network, frontMan: entry.front_man, origin: url.origin };
}
