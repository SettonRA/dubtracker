# deploy/ — Kubernetes manifests

Runs AnimeDubTracker on the [RKE2 cluster](https://wiki.tech-ra.net/infrastructure/kubernetes)
instead of Docker Compose on Docker01. Migrated 2026-08-30 as the first
container-migration test.

- **Stateless** — releases are held in memory and back-filled from Reddit's RSS
  (5 days) on startup, so a restart / reschedule just re-fetches. 1 replica.
- **Image**: `ghcr.io/settonra/dubtracker:latest`, built + pushed by
  `.github/workflows/publish.yml` on push to `main`. The GHCR package is public
  (trivial, non-sensitive) so the cluster pulls anonymously.
- **Ingress**: `dubs.cineclark.studio`, class `nginx`. TLS termination and the
  Cloudflare/real-IP handling stay on NPM at Proxy01, which proxies to the
  cluster via its `k8s_ingress` upstream. This service is public — no Authelia.

## Apply

```bash
ssh skuld
kubectl apply -k /path/to/AnimeDubTracker/deploy
kubectl -n dubtracker rollout status deploy/dubtracker
```

## Cutover / rollback

- Pre-cutover test (Docker01 still serving prod):
  `curl -sk -H 'Host: dubs.cineclark.studio' https://192.168.1.100/`
- Cutover: NPM proxy host `dubs.cineclark.studio` (id 19) → Advanced
  `proxy_pass https://k8s_ingress;`
- Rollback: point NPM host 19 back at `http://192.168.1.111:3001` (the Docker01
  container is left running until the k8s version is trusted).

## Update the image

CI publishes `:latest` and `:sha-<commit>` on every push. `kubectl -n dubtracker
rollout restart deploy/dubtracker` to pull a new `:latest`, or set `newTag` in
`kustomization.yaml` to a pinned `:sha-...` and re-apply.
