/**
 * Disclosure Door — Build Script
 *
 * Reads blog posts from the ufology-llm-wiki youtube directory,
 * converts markdown to HTML, and generates a static site.
 *
 * Usage: node scripts/build.js [--watch]
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// ─── Configuration ────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const WIKI_ROOT = path.resolve(process.env.HOME, 'Documents/ufology-llm-wiki/youtube');
const OUTPUT_DIR = path.join(REPO_ROOT, 'dist');
const SRC_DIR = path.join(REPO_ROOT, 'src');

// Blog posts directory regex: extract Korean filename slug from path
const BLOG_FILE_PATTERN = /youtube\/[^/]+\/blog\/(.+)\.md$/;

// ─── Helpers ───────────────────────────────────────────────────

function slugify(text) {
  return text
    .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Handle YYYY-MM-DD
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── Content Discovery ────────────────────────────────────────

function discoverPosts() {
  const videos = [];

  if (!fs.existsSync(WIKI_ROOT)) {
    console.error(`Wiki directory not found: ${WIKI_ROOT}`);
    return videos;
  }

  const videoDirs = fs.readdirSync(WIKI_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const videoDir of videoDirs) {
    const blogDir = path.join(WIKI_ROOT, videoDir, 'blog');
    if (!fs.existsSync(blogDir)) continue;

    const blogFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

    // Check if the video has a translation file for source metadata
    const translationDir = path.join(WIKI_ROOT, videoDir, 'translation');
    let videoMeta = {};

    if (fs.existsSync(translationDir)) {
      const transFiles = fs.readdirSync(translationDir).filter(f => f.endsWith('.md'));
      if (transFiles.length > 0) {
        const transContent = readFileSafe(path.join(translationDir, transFiles[0]));
        if (transContent) {
          const parsed = matter(transContent);
          videoMeta = {
            source_url: parsed.data.source || '',
            channel: parsed.data.channel || '',
            video_title: parsed.data.title || videoDir,
          };
        }
      }
    }

    // If no translation, look for raw transcript
    if (!videoMeta.source_url) {
      const rawDir = path.join(WIKI_ROOT, videoDir, 'raw');
      if (fs.existsSync(rawDir)) {
        const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));
        for (const rf of rawFiles) {
          const content = readFileSafe(path.join(rawDir, rf));
          if (content) {
            const parsed = matter(content);
            if (parsed.data.source_url || parsed.data.source) {
              videoMeta.source_url = parsed.data.source_url || parsed.data.source;
              videoMeta.video_title = parsed.data.title || videoDir;
              break;
            }
          }
        }
      }
    }

    const posts = blogFiles.map(filename => {
      const filePath = path.join(blogDir, filename);
      const raw = readFileSafe(filePath);
      if (!raw) return null;

      const parsed = matter(raw);
      const slug = filename.replace(/\.md$/, '');

      // Convert markdown to HTML
      const htmlContent = marked.parse(parsed.content, {
        breaks: true,
        gfm: true,
      });

      return {
        slug,
        filename,
        title: parsed.data.title || slug,
        date: parsed.data.date || '',
        tags: parsed.data.tags || [],
        source: parsed.data.source || videoMeta.video_title || videoDir,
        source_url: parsed.data.source_url || videoMeta.source_url || '',
        htmlContent,
        videoDir,
        filePath,
      };
    }).filter(Boolean);

    if (posts.length > 0) {
      // Sort by date descending
      posts.sort((a, b) => {
        if (a.date && b.date) return new Date(b.date) - new Date(a.date);
        return 0;
      });

      videos.push({
        title: videoMeta.video_title || videoDir,
        source_url: videoMeta.source_url || '',
        channel: videoMeta.channel || '',
        dir: videoDir,
        posts,
      });
    }
  }

  // Sort videos by most recent post
  videos.sort((a, b) => {
    const aDate = a.posts[0]?.date || '';
    const bDate = b.posts[0]?.date || '';
    return new Date(bDate) - new Date(aDate);
  });

  return videos;
}

// ─── Template Helpers ─────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTags(tags) {
  if (!tags || tags.length === 0) return '';
  return tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
}

// ─── Page Templates ───────────────────────────────────────────

function baseHtml(title, content, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Disclosure Door</title>
  <meta name="description" content="UFO disclosure blog — Korean translations of YouTube content">
  <link rel="stylesheet" href="/style.css">
  ${extraHead}
</head>
<body>
  <div class="container">
    <header>
      <h1><a href="/" style="text-decoration:none;color:inherit">Disclosure Door</a></h1>
      <p>한국어로 만나는 UFO 진실 — YouTube 콘텐츠 번역 블로그</p>
      <p class="subtitle">UFO disclosure in Korean — translated YouTube content</p>
    </header>

    ${content}

    <footer>
      <p><a href="https://disclosuredoor.com">Disclosure Door</a> — UFO 진실을 한국어로</p>
    </footer>
  </div>
</body>
</html>`;
}

function renderHomePage(videos) {
  const totalPosts = videos.reduce((sum, v) => sum + v.posts.length, 0);

  let content = `<p style="text-align:center;color:var(--text-dim);margin-bottom:40px;font-size:0.95rem;">
    총 ${totalPosts}개의 블로그 게시물 · ${videos.length}개의 YouTube 영상
  </p>`;

  for (const video of videos) {
    content += `
    <section class="source-card">
      <h2>${escapeHtml(video.title)}</h2>`;

    if (video.source_url) {
      content += `<p class="source-meta">원본: <a href="${escapeHtml(video.source_url)}" target="_blank" rel="noopener">YouTube</a>`;
      if (video.channel) content += ` · ${escapeHtml(video.channel)}`;
      content += `</p>`;
    }

    content += `<div class="post-list">`;

    for (const post of video.posts) {
      content += `
      <a href="/posts/${post.slug}/" class="post-item">
        <h3>${escapeHtml(post.title)}</h3>
        <div class="post-meta">
          ${post.date ? `<span>${formatDate(post.date)}</span>` : ''}
        </div>
        ${post.tags.length > 0 ? `<div class="post-tags">${renderTags(post.tags)}</div>` : ''}
      </a>`;
    }

    content += `</div></section>`;
  }

  return baseHtml('홈', content);
}

function renderPostPage(post) {
  const content = `
  <article>
    <header class="post-header">
      <div class="breadcrumb">
        <a href="/">홈</a> › ${escapeHtml(post.source)}
      </div>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="meta-line">
        ${post.date ? `<span>${formatDate(post.date)}</span>` : ''}
        ${post.source_url ? `<a href="${escapeHtml(post.source_url)}" target="_blank" rel="noopener">원본 영상</a>` : ''}
      </div>
      ${post.tags.length > 0 ? `<div class="tag-list">${renderTags(post.tags)}</div>` : ''}
    </header>
    <div class="post-content">
      ${post.htmlContent}
    </div>
    <a href="/" class="back-to-top">← 목록으로</a>
  </article>`;

  return baseHtml(post.title, content);
}

// ─── Build ─────────────────────────────────────────────────────

function build() {
  console.log('🔍 Discovering blog posts...');
  const videos = discoverPosts();

  if (videos.length === 0) {
    console.warn('⚠️  No blog posts found. Check wiki path:', WIKI_ROOT);
  } else {
    const total = videos.reduce((s, v) => s + v.posts.length, 0);
    console.log(`📦 Found ${total} blog posts across ${videos.length} videos`);
  }

  // Clean output dir
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy static assets
  const staticFiles = ['style.css', '_headers', '_redirects'];
  for (const file of staticFiles) {
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`📄 Copied ${file}`);
    }
  }

  // Build posts
  for (const video of videos) {
    for (const post of video.posts) {
      const postDir = path.join(OUTPUT_DIR, 'posts', post.slug);
      fs.mkdirSync(postDir, { recursive: true });

      const html = renderPostPage(post);
      fs.writeFileSync(path.join(postDir, 'index.html'), html, 'utf-8');
      console.log(`  ✓ /posts/${post.slug}/`);
    }
  }

  // Build homepage
  const homeHtml = renderHomePage(videos);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), homeHtml, 'utf-8');
  console.log('📄 Built index.html');

  // Print summary
  const totalPosts = videos.reduce((s, v) => s + v.posts.length, 0);
  console.log(`\n✅ Done! ${totalPosts} posts built → ${OUTPUT_DIR}`);
}

// ─── Entry ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--watch')) {
  console.log('👀 Watch mode — rebuilding on change...');
  build();
  fs.watch(WIKI_ROOT, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`\n🔄 Change detected: ${filename}`);
      build();
    }
  });
} else {
  build();
}
