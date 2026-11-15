# Browser-hosted internet matches

On November 15, a live-site test reproduced the guest's 30-second timeout when
ICE was forced to use a relay. PeerJS's bundled `eu-0.turn.peerjs.com` and
`us-0.turn.peerjs.com` servers returned lookup errors, with no relay candidates.
A separate direct two-profile connection succeeded using host candidates. That
test does not establish connectivity between different internet providers.

The client now requests expiring ICE credentials from `POST /api/ice-servers`.
Cloudflare Pages Functions keeps the master key out of the browser and repository.
Only that API path invokes a Function; the game/assets retain static hosting.
Without configured secrets, direct networking stays available. A failed join is
not proof that a relay is necessary: a new direct attempt can succeed. More STUN
servers alone do not replace a relay for networks that cannot connect directly.

## Cloudflare relay setup

The user explicitly authorized relay activation on November 15, 2026 and added
Production TURN secrets in the Cloudflare dashboard. Redeployment `cd2442c`
activated the existing endpoint. A forced-relay test with production-issued
credentials connected two browser profiles through TURN and synchronized the
villa world. Both selected routes were relay-to-relay, with traffic in both
directions. This validates the service; the user's two PCs still need to retry.

`node scripts/check-turn-relay.mjs` repeats the test using Vite at port 5194.
It keeps credentials in memory and reports only route types and byte counts.
Normal gameplay retains direct connections where possible and can use relay
candidates when direct routes fail.

1. In the Cloudflare account, open **Realtime → TURN** and create a TURN key for
   this game. Review the service's billing terms before activating it.
2. In **Workers & Pages → gungame → Settings → Variables and Secrets**, configure
   these in the **Production** environment:
   - `TURN_KEY_ID`: the TURN key ID.
   - `TURN_KEY_API_TOKEN`: the API token paired with that TURN key, stored as a
     **Secret**. Never use a `VITE_` prefix, commit the token, or paste it in chat.
3. Redeploy the Pages project. The repository-root `functions/api/ice-servers.js`
   must be deployed as a Pages Function alongside the Vite `dist` output.
4. Refresh **both** clients and create a **new** room. Verify a forced-relay
   connection before declaring cross-network play fixed, then test the two PCs
   on their actual separate networks.

Cloudflare's published allowance is 1,000 GB/month shared between SFU/TURN;
additional outbound traffic is $0.05/GB. Creating/activating a billable service
requires the account owner's decision. Credentials last four hours; create a new
room after that period. An optional `TURN_RATE_LIMITER` binding can apply account
rate limiting to credential requests. The endpoint rejects cross-origin browser
requests and doesn't publicly cache credentials. This is an unlisted testing
site, not an authenticated production credential-distribution service: before
public release, gate credential issuance to authenticated room participants and
configure usage controls.

Sources:
- https://developers.cloudflare.com/realtime/turn/generate-credentials/
- https://developers.cloudflare.com/realtime/turn/faq/
- https://developers.cloudflare.com/realtime/sfu/platform/pricing/

`tests/browser-relay.test.js` validates the key exchange, safe failures, fallback,
origin checks and specific errors. Mock credentials verify the integration
contract; they do not prove the TURN service is provisioned or reachable.

## Intermittent direct joins and room lifecycle

The user reported that recreating a room allowed the same PCs on different
connections to join. This demonstrates that a failed attempt alone does not
establish that their network combination always needs a paid relay.

Code inspection also found that PeerJS's signaling `open` event could start a
second worker and install duplicate incoming-connection handlers after broker
reconnection. The host now retains one worker and one handler across reconnects.
Temporary broker network errors preserve an established match. A failed initial
guest connection retries once using a fresh peer against the same room; explicit
password/map/full-room rejections do not retry. Incomplete guest handshakes expire
after 20 seconds and release their slots, with timers/listeners cleaned up.

`tests/browser-room-lifecycle.test.js` covers these failure paths.
`node scripts/check-browser-reconnect.mjs` exercises actual PeerJS/WebRTC with an
intentionally closed first attempt, broker disconnect/reconnect, and guest rejoin
without replacing the host worker. This remains a local two-profile test, not a
guarantee for every internet provider/router combination.
