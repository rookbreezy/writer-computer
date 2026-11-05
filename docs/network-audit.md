# Network audit — personal Writer fork

Source audit performed 2026-11-05 against the fork of `joelbqz/writer-computer` v0.8.0. This describes source behavior, not a packet capture of the previously installed upstream binary. Network behavior was preserved in this fork.

## Desktop app

| Behavior               | Destination                                                                                                                | Trigger and information                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic updater      | `https://github.com/joelbqz/writer-computer/releases/latest/download/latest.json`, redirects to GitHub release asset hosts | Checks about two seconds after launch, every 24 hours while running, and on **Check for Updates**. Version/platform checking; no document-upload call found. Installing an accepted update downloads an upstream release. The updater still targets upstream, so accepting it can replace this fork's changes.                                           |
| Usage telemetry        | `https://us.i.posthog.com/batch/` by default; build-time host override possible                                            | Rust `reqwest` POST batches. Requires a compiled-in `WRITER_POSTHOG_KEY`, the runtime kill switch unset, and a recorded answer to the first-run prompt. The four usage events require Share Usage Data. Properties are random install UUID, app version, OS, architecture, geo-IP disable flag and optional user-entered email.                          |
| Telemetry exceptions   | Same PostHog destination                                                                                                   | In an upstream telemetry-enabled build, **Not now** sends one `prompt_declined` event even though usage is off. Setting/changing/clearing an email sends `email_updated` independently of the usage switch. Neither exception exists without a compiled key.                                                                                             |
| Embedded remote images | The HTTPS hosts named in a note's Markdown/HTML, including remote image URLs in inline styles                              | Rendering a note may automatically download the image. The remote host sees the request and normal network metadata; tracking-image URLs are possible. The production CSP permits HTTPS images; plain HTTP is recognized by the resolver but not permitted by that CSP. Local `asset:` URLs stay local. Other media is restricted by the production CSP. |
| External links         | User-selected URL, via the system URL opener                                                                               | Clicking an external link launches the default handler/browser. Local note links resolve on disk.                                                                                                                                                                                                                                                        |

No cloud sync, document-upload API, remote AI service, or other application HTTP client was found in the desktop source. That does not prove an arbitrary installed binary is identical, nor account for operating-system services such as iCloud syncing a user-selected folder.

**Clone builds:** without `WRITER_POSTHOG_KEY`, telemetry does not construct a client, generate an analytics identity or show a consent prompt. The updater and remote images remain capable of network access. `WRITER_TELEMETRY_DISABLED=1` is an additional runtime kill switch for builds with a key.

**Development/test-only traffic:** Vite uses localhost port 1420 (and optional HMR WebSocket port 1421). The optional Rust `e2e` feature embeds a WebDriver HTTP server on localhost:4445, with intermediary port 4444. This is not enabled in ordinary builds. Installing dependencies/build tools downloads from their package registries; that is build-time traffic.

## Website (separate from the app)

The repository also contains `apps/website` for writer.computer. It fetches the latest release from `https://api.github.com/repos/joelbqz/writer-computer/releases/latest`. If a build-time PostHog key is supplied, the website's PostHog JS SDK reports page views and the explicit Updates/GitHub/Download interactions. Its configuration disables autocapture, heatmaps, exception capture, session recording and surveys. Without a key the website analytics wrapper is inert. These website modules are not imported by the desktop app.

## Code references

- `apps/desktop/src-tauri/tauri.conf.json`: updater URL and production content security policy.
- `apps/desktop/src-tauri/src/lib.rs`: delayed launch and daily updater scheduling; feature-gated WebDriver plugin.
- `apps/desktop/src-tauri/src/updater.rs`: check/download/install flow.
- `apps/desktop/src-tauri/src/telemetry.rs` and `docs/telemetry.md`: PostHog client, consent gates, payloads and exceptions.
- `apps/desktop/src/components/editor-area/image-src-resolver.ts`, `html-block-decorations.ts`, `link-navigation.ts`: remote resources and link handling.
- `apps/website/src/latest-release.ts`, `analytics.tsx`, `analytics-config.ts`: website-only requests.
