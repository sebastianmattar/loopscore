## Releasing loopscore

This repository uses Changesets for versioning and GitHub Actions for npm publishing. Publishing is done through npm trusted publishing, so there is no long-lived `NPM_TOKEN` secret to manage.

### One-time setup

1. Create or claim the `loopscore` package on npm.
2. In npm package settings, add this repository and `.github/workflows/publish.yml` as a trusted publisher.
3. Confirm the default branch is `main`.

### Normal release flow

1. Make your code changes.
2. Run `pnpm changeset` and describe the release.
3. Commit the generated file under `.changeset/` with your code changes.
4. Merge that pull request into `main`.
5. The release workflow will open or update a release pull request with the version bump and changelog.
6. Merge the release pull request.
7. The same workflow will publish to npm and create the GitHub release.

### Useful commands

- `pnpm changeset`: create a release note and choose the version bump.
- `pnpm version-packages`: apply pending Changesets locally.
- `pnpm release`: publish the already-versioned package.

### Notes

- Do not edit `package.json` version manually for normal releases.
- The workflow always runs lint and build before opening a release pull request or publishing.
- Changelog entries are generated from Changesets and linked to GitHub commits and pull requests.
