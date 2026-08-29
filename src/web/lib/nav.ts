/**
 * src/web/lib/nav.ts
 *
 * WHAT IT IS
 * The router. Two pure functions, `parseHash` and `hrefFor`, and the type of a screen.
 *
 * WHY IT EXISTS
 * Every substep of the token walk needs its own address, because a mentor sends a founder
 * straight to step 4 in Slack and a founder who closes the tab comes back to where they
 * were. That is section 6, and it is the whole reason there is a router at all.
 *
 * WHY THE ADDRESSES CARRY A HASH. A path router needs the server to answer every unknown
 * path with index.html. That catch all belongs to whoever owns the Fastify routes, it is
 * easy to get subtly wrong next to a static file handler, and when it is wrong the symptom
 * is a founder pasting a link into a browser and getting "Not Found" on the morning of the
 * event. A hash address is still one address per step, it survives a reload and a paste,
 * and it needs nothing from the server. When the catch all exists and is tested, this file
 * is the only one that changes.
 *
 * An address we do not recognise resolves to `unknown` rather than to Home. Silently
 * bouncing somebody to Home loses the evidence that a mentor sent a link with a typo in it.
 *
 * WHAT CALLS IT
 * app.tsx, which listens for `hashchange`, and every link in the app.
 *
 * WHAT IT READS AND WRITES
 * Nothing. `location` is read by app.tsx and passed in.
 */

/** Every screen the app has. One shape per screen, so a screen cannot be half addressed. */
export type View =
  | { readonly kind: "home" }
  | { readonly kind: "first-run" }
  | { readonly kind: "setup" }
  | { readonly kind: "setup-ghl-intro" }
  | { readonly kind: "setup-ghl-step"; readonly slug: string }
  | { readonly kind: "setup-apollo" }
  | { readonly kind: "thread"; readonly routeId: string }
  | { readonly kind: "files" }
  | { readonly kind: "file"; readonly name: string }
  | { readonly kind: "gates" }
  | { readonly kind: "unknown"; readonly raw: string };

export const HOME: View = { kind: "home" };

/**
 * Split a hash into its segments.
 *
 * Empty, "#", "#/" and a missing hash are all Home, because all four are what a browser
 * produces at different moments and none of them is a founder asking for something odd.
 */
function segments(hash: string): string[] {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return raw
    .split("/")
    .map((s) => decodeURIComponent(s.trim()))
    .filter((s) => s.length > 0);
}

export function parseHash(hash: string): View {
  const parts = segments(hash);
  const head = parts[0];
  if (head === undefined) return HOME;

  switch (head) {
    case "start":
      return { kind: "first-run" };
    case "setup": {
      const second = parts[1];
      if (second === undefined) return { kind: "setup" };
      if (second === "apollo") return { kind: "setup-apollo" };
      if (second === "ghl") {
        const slug = parts[2];
        return slug === undefined ? { kind: "setup-ghl-intro" } : { kind: "setup-ghl-step", slug };
      }
      return { kind: "unknown", raw: hash };
    }
    case "thread": {
      const routeId = parts[1];
      return routeId === undefined ? { kind: "unknown", raw: hash } : { kind: "thread", routeId };
    }
    case "files": {
      const name = parts.slice(1).join("/");
      return name === "" ? { kind: "files" } : { kind: "file", name };
    }
    case "gates":
      return { kind: "gates" };
    default:
      return { kind: "unknown", raw: hash };
  }
}

/**
 * The address of a screen.
 *
 * Every link in the app is built here, so a link and the parser cannot disagree. A file
 * name may hold a slash, `people/` is a row, so the name is encoded segment by segment.
 */
export function hrefFor(view: View): string {
  switch (view.kind) {
    case "home":
      return "#/";
    case "first-run":
      return "#/start";
    case "setup":
      return "#/setup";
    case "setup-ghl-intro":
      return "#/setup/ghl";
    case "setup-ghl-step":
      return `#/setup/ghl/${encodeURIComponent(view.slug)}`;
    case "setup-apollo":
      return "#/setup/apollo";
    case "thread":
      return `#/thread/${encodeURIComponent(view.routeId)}`;
    case "files":
      return "#/files";
    case "file":
      return `#/files/${view.name.split("/").map(encodeURIComponent).join("/")}`;
    case "gates":
      return "#/gates";
    case "unknown":
      return "#/";
  }
}
