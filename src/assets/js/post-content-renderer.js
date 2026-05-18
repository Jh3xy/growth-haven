const TOKEN_PATTERN = /(https?:\/\/[^\s<>"']+|#[A-Za-z0-9_]+)/g;
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}]+$/;

function splitTrailingPunctuation(value) {
  const trailing = value.match(TRAILING_URL_PUNCTUATION)?.[0] || "";
  if (!trailing) return { value, trailing };

  return {
    value: value.slice(0, -trailing.length),
    trailing,
  };
}

function createLinkNode(rawUrl, className) {
  const { value: urlText, trailing } = splitTrailingPunctuation(rawUrl);

  try {
    const url = new URL(urlText);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return document.createTextNode(rawUrl);
    }

    const fragment = document.createDocumentFragment();
    const link = document.createElement("a");
    link.className = className;
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer ugc nofollow";
    link.textContent = urlText;
    fragment.append(link);

    if (trailing) {
      fragment.append(document.createTextNode(trailing));
    }

    return fragment;
  } catch {
    return document.createTextNode(rawUrl);
  }
}

function createHashtagNode(rawHashtag, className) {
  const tag = document.createElement("strong");
  tag.className = className;
  tag.textContent = rawHashtag;
  return tag;
}

export function renderPostContent(
  target,
  content,
  {
    linkClassName = "blog-post__link",
    hashtagClassName = "blog-post__hashtag",
  } = {},
) {
  if (!target) return;

  const text = String(content || "");
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index || 0;

    if (index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, index)));
    }

    if (token.startsWith("http://") || token.startsWith("https://")) {
      fragment.append(createLinkNode(token, linkClassName));
    } else {
      fragment.append(createHashtagNode(token, hashtagClassName));
    }

    cursor = index + token.length;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  target.replaceChildren(fragment);
}
