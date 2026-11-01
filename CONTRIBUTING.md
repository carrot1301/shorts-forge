# Contributing

Start with a focused issue or pull request describing the problem and resulting behavior. Useful additions include original 3D scenes, readable themes, languages, voice-provider adapters and targeted bug fixes.

1. Use Node 22.13+, install with `npm ci`, and run `npm test`.
2. Test render changes with `npm run demo`; inspect actual output and technical QC.
3. Keep new fixtures synthetic and visibly identified. Never commit downloaded stock, private project exports or credentials.
4. Preserve actual narration timing, explicit review gates, local rendering and dependency licenses.
5. Run `npm run check:public` after staging. This scans tracked files and can catch some secret/path mistakes; it is not an exhaustive secret detector.

Explain validation and material limitations in the PR. Avoid unrelated reformatting or framework migration. Do not claim a rights/visual review that you did not perform.
