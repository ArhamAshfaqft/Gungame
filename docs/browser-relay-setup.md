# Browser-hosted internet matches

On November 15, a live-site test reproduced the guest's 30-second timeout when
ICE was forced to use a relay. PeerJS's bundled `eu-0.turn.peerjs.com` and
`us-0.turn.peerjs.com` servers returned lookup errors, with no relay candidates.
A separate direct two-profile connection succeeded using host candidates. That
test does not establish connectivity between different internet providers.

The client now requests expiring ICE credentials from `POST /api/ice-servers`.
Cloudflare Pages Functions keeps the master key out of the browser and repository.
Only that API path invokes a Function; the game/assets retain static hosting.
Without configured secrets, direct networking stays available and a failed join
explicitly identifies the missing/unavailable relay. More STUN servers alone do
not replace a relay for networks that cannot connect directly.

## Account setup still required

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
