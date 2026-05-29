# Mini Games — GitHub Pages static app

This is a small mobile-first static site with two mini-games: *36 Questions* and *Truth or Dare*.

Quick notes:
- The official Arthur Aron "36 Questions" text is not included by default. To enable it, paste the full list into `gh-pages/data/36questions.json` as a JSON array.
- `gh-pages/data/tod_prompts.json` contains sample prompts for the three spice levels: `mild`, `regular`, `hot`.

To preview locally:

n```bash
# from project root
cd gh-pages
# use a static server, e.g. Python 3
python -m http.server 5173
# then open http://localhost:5173
```

To publish on GitHub Pages:
1. Create a repository and push this folder to the `gh-pages` branch or configure GitHub Pages to serve from `/docs`.
2. Alternatively, copy the contents of this folder to your repo's `docs/` and enable Pages from `main/docs`.

If you'd like I can (a) add the full 36 Questions list for you (confirm you want that), or (b) wire up nicer transitions, save progress to localStorage, and add share links.
