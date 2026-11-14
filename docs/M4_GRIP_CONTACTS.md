# M4 palm and grip calibration

The full-body M4 now uses measured skin contacts and complete grip frames. It no longer treats the wrist joint as the palm contact. First-person placement and the other weapons retain their existing fitting paths.

`PalmGripFrames.js` reads an actual palmar triangle from each glove. The triangle's vertex indices and barycentric coordinates identify a physical skin contact. Its surface normal and the knuckle direction define orientation. The right thumb pad contributes to that palm surface, so the sampler accepts blended skin influences instead of accidentally selecting the more rigid back of the hand.

The gun contacts are ray-sampled from the M4's real geometry: the trigger-grip side and the rear underside of the handguard. The named nodes `grip_contact_trigger` and `grip_contact_support` carry both position and orientation. Moving/reorienting a node changes the contact frame; the solver reads the node's world transform, which also allows a future attachment to own it.

The idle/ready animation provides wrist and elbow reference frames. The solver bends the arms to the target, applies bounded roll corrections against those authored frames, and checks the deformed glove contact after solving. A carry adjustment of at most 15 cm handles targets slightly outside arm reach. No limb stretching or skin-weight/vertex edits are performed. The support hand keeps its original released motion during reload, throw and hit actions.

Existing Studio adjustments remain available. Explicit palm markers keep their existing override path. Raw joint rotations can move a contact after the solve; the final diagnostic measures that actual resulting gap rather than reporting the wrist target as proof of palm contact.

The measured data and source asset hashes are recorded in [m4-grip-frame-reference.json](m4-grip-frame-reference.json). Regenerate it with `node scripts/export-m4-grip-reference.mjs` while the local game server is running on port 5181.

Validation uses the production character and M4 GLBs. Tests cover 24 pose/state/time combinations, both hands, frame relocation/rotation, reload hand release, original bone lengths, unchanged skin/vertex buffers, and sleeve thickness near the elbows. In the sampled combinations the worst measured palm gap was 0.480 mm, with up to 5.28 degrees of normal variation in the deformed glove surface. These are measurements of those samples, not a claim that every possible pose or manual override is correct.

M4 holding chains are now restored from calibrated carry/ADS arm references before weapon placement; locomotion keeps its torso/hip/leg motion. A whole-chain direction correction prevents source torso/wrist rotations from raising the rifle over the head. Reload/throw/hit actions retain their authored release. Full-cycle regression samples 11 movement clips in ready and ADS at 48 phases each (1,056 frames), checking local elbow continuity, receiver height and both physical palm contacts. Worst sampled forearm step: 5.63 degrees; palm gap: below 0.5 mm. Manual Studio joint/contact overrides remain authoritative and can still produce invalid poses.
