# Generated Artifacts

Dialogia evaluation and simulation scripts write local-only outputs to `tmp/` by default.
These files are not intended for version control.

Common outputs:

- `tmp/tutor_evals/` from `scripts/eval-tutor.ts`
- `tmp/ablation/` from `scripts/run-ablation.ts`
- `tmp/tutor-sim-*.json` from `scripts/tutor-sim.ts`

Cleanup:

- `rm -rf tmp/*`
