# Disclosure Door

UFO disclosure blog — Korean translations of YouTube content. Built from the [ufology-llm-wiki](https://github.com/iamswain25/ufology-llm-wiki) youtube directory.

## How it works

1. Blog posts live as markdown files in the wiki at `youtube/<Video Name>/blog/*.md`
2. The build script reads those files, converts them to HTML, and generates a static site
3. Deployed on Cloudflare Pages

## Development

```bash
npm install
npm run build      # Build the site
npm run dev        # Build with file watching
```

Output goes to `dist/`.

## Deployment

Deployed on Cloudflare Pages. The build command is `npm run build` and output directory is `dist/`.

## Adding a new blog post

Just create a new `.md` file in the corresponding video's `blog/` directory in the wiki, with YAML frontmatter:

```yaml
---
title: "Your Korean Title"
date: 2026-06-01
source: "YouTube Video Name"
source_url: "https://youtube.com/watch?v=..."
tags: [tag1, tag2]
---
```

Then rebuild. That's it.
