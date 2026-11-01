# Security

Never put API keys, access tokens or private footage into issues or pull requests. Use your own local `.env`, which Git ignores. If a key was exposed, revoke it with its provider; deleting the visible line does not remove Git history.

For a vulnerability containing sensitive details, use GitHub's private vulnerability reporting on this repository when enabled. Otherwise open a minimal issue asking for a private reporting channel without including exploit details, credentials or personal data.

Run this CLI only on project files you trust. It invokes local Node, Chromium and FFmpeg; this is not a sandbox for untrusted uploaded projects. Keep those tools updated.
